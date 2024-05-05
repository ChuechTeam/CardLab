
using System.Diagnostics;
using System.Net;
using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardLab.API;

[Route("api/game/[controller]")]
[ApiController]
[Authorize]
public class CardsController(ILogger<CardsController> logger) : ControllerBase
{
    private const int MaxCardImageSize = 2 * 1024 * 1024; // 2 MB

    [HttpPost("{index:int}/image")]
    public async Task<IActionResult> PostCardImage([FromForm(Name = "image")] IFormFile file, int index)
    {
        if (file.ContentType != "image/png")
        {
            return BadRequest("Only PNG images are supported.");
        }

        if (file.Length > MaxCardImageSize)
        {
            return BadRequest("File too large.");
        }

        var user = ((GameUserPrincipal)User);
        var session = user.GameSession;
        if (user.PlayerId is not { } playerId)
        {
            return BadRequest("The host can't upload files (why do you want to do that?)");
        }

        if (session.Settings.CardsPerPlayer <= index || index < 0)
        {
            return BadRequest("Invalid card index.");
        }

        // First copy the file to memory so we don't get an upload that takes ages to
        // write to the filesystem.
        using var mem = new MemoryStream((int)file.Length);
        await file.CopyToAsync(mem);
        mem.Position = 0;

        var player = session.Players[playerId];
        var result = player.BeginCardUpload(index);

        if (result.FailedWith(out var msg))
        {
            return Problem(msg);
        }

        var tkn = result.Value;
        try
        {
            var path = player.CardPackInfos[index].ImgFilePath;
            var dirName = Path.GetDirectoryName(path);
            if (dirName is not null)
            {
                Directory.CreateDirectory(dirName);
            }

            await using (var stream = System.IO.File.Create(path))
            {
                await mem.CopyToAsync(stream, tkn);
            }

            return Ok();
        }
        finally
        {
            // Ignore failures, if it fails it means that it's already marked as not uploading
            player.EndCardUpload(index);
        }
    }

    public record CardInput(
        string Name,
        string Lore,
        string? Archetype,
        int Attack,
        int Health,
        CardScript? Script);

    public record CardPostResult(
        CardModule.ValidationSummary Validation,
        CardModule.UsageSummary? Balance,
        string Description,
        string? Archetype);

    [HttpPost("{index:int}")]
    public ActionResult<CardPostResult?> PostCard(int index, CardInput card)
    {
        var user = ((GameUserPrincipal)User);
        var session = user.GameSession;
        var player = user.Player;
        if (player is null)
        {
            return Problem("Can't do that as the host", statusCode: (int)HttpStatusCode.Forbidden);
        }

        if (index >= session.Settings.CardsPerPlayer || index < 0)
        {
            return Problem("Invalid card index.", statusCode: (int)HttpStatusCode.Conflict);
        }

        if (!session.AllowedCardUpdates.def)
        {
            return Problem("Card updates are disabled.", statusCode: (int)HttpStatusCode.Conflict);
        }
#if DEBUG
        var sw = Stopwatch.StartNew();
#endif
        var archetype = !string.IsNullOrWhiteSpace(card.Archetype)
            ? CardModule.CapitalizeArchetype(card.Archetype)
            : null;
        var definition = player.Cards[index] with
        {
            Name = CardModule.SanitizeString(card.Name),
            Lore = CardModule.SanitizeString(card.Lore),
            Archetype = archetype,
            NormalizedArchetype = archetype != null ? CardModule.NormalizeArchetype(archetype) : null,
            Author = player.Name,
            Attack = card.Attack,
            Health = card.Health,
            Script = card.Script
        };

        CardModule.UsageSummary? balance = null;
        var validation = CardModule.ValidateDefinition(definition, out var preventsBalanceCalc);
        if (!preventsBalanceCalc)
        {
            balance = CardModule.CalculateCardBalance(definition);
            definition = definition with
            {
                Description = CardModule.GenerateCardDescription(definition)
            };
        }

        if (validation.DefinitionValid && balance is { Balanced: true })
        {
            if (player.UpdateCard(definition, index).FailedWith(out var err))
            {
                return Problem(err, statusCode: (int)HttpStatusCode.Conflict);
            }
        }
        
#if DEBUG
        sw.Stop();
        logger.LogTrace("Card definition update took {MicroSeconds}µs", sw.ElapsedTicks / (Stopwatch.Frequency / 1_000_000));
#endif
        CardPostResult result = new(validation, balance, definition.Description, definition.Archetype);
        return result;
    }
}