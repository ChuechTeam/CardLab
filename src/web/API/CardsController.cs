using System.Collections.Immutable;
using System.Net;
using System.Text;
using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.Extensions.Primitives;

namespace CardLab.API;

[Route("api/game/[controller]")]
[ApiController]
[Authorize]
public class CardsController(CardBalancer cardBalancer) : ControllerBase
{
    // Limit the image size to 1 MB, which is larger than the maximum size of a
    // raw bitmap image of size 300x500 (600000 bytes).
    private const int MaxCardImageSize = 1024 * 1024; // 1 MB

    private string GetCardImagePath(GameSession session, int playerId, int cardIndex, out string dir)
    {
        // TODO: should be configurable and cleaned automatically when exceeding a total size.
        var rootDir = Path.Combine(Path.GetTempPath(), "CardLabAssets");
        var gameDir = Path.Combine(rootDir, session.PermanentId.ToString());
        dir = Path.Combine(gameDir, "Cards");
        var imgFile = Path.Combine(dir, $"{playerId}_{cardIndex}.png");
        return imgFile;
    }

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

        if (session.CardsPerPlayer <= index || index < 0)
        {
            return BadRequest("Invalid card index.");
        }

        // Is this check unnecessary? BeginCardUpload already does it...
        if (session.PhaseName != GamePhaseName.CreatingCards)
        {
            return BadRequest($"Wrong phase. (Phase=${session.PhaseName})");
        }

        var player = session.Players[playerId];
        var result = player.BeginCardUpload(index);

        if (result.FailedWith(out var msg))
        {
            return Problem(msg);
        }

        try
        {
            var path = GetCardImagePath(session, playerId, index, out string dir);
            Directory.CreateDirectory(dir);

            await using (var stream = System.IO.File.Create(path))
            {
                await file.CopyToAsync(stream);
            }

            return Ok();
        }
        finally
        {
            player.EndCardUpload(index).ThrowIfFailed();
        }
    }

    public record CardInput(string Name, string Lore, int Cost, int Attack, int Health, CardScript? Script);

    public record CardPostResult(
        CardBalancer.ValidationSummary Validation,
        CardBalancer.UsageSummary? Balance,
        string Description);

    [HttpPost]
    public ActionResult<IEnumerable<CardPostResult?>> PostCards(IEnumerable<CardInput?> cards)
    {
        var user = ((GameUserPrincipal)User);
        var session = user.GameSession;
        var player = user.Player;
        if (player is null)
        {
            return Problem("Can't do that as the host", statusCode: (int)HttpStatusCode.Forbidden);
        }

        var cards2 = cards.ToList();
        if (cards2.Count != session.CardsPerPlayer)
        {
            return Problem("Invalid number of cards.", statusCode: (int)HttpStatusCode.Conflict);
        }

        return new ActionResult<IEnumerable<CardPostResult?>>(Eval());

        IEnumerable<CardPostResult?> Eval()
        {
            for (var i = 0; i < cards2.Count; i++)
            {
                var card = cards2[i];
                if (card is null)
                {
                    yield return null;
                    continue;
                }

                yield return UpdateSingleCard(i, card, player);
            }
        }
    }

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

        if (index >= session.CardsPerPlayer || index < 0)
        {
            return Problem("Invalid card index.", statusCode: (int)HttpStatusCode.Conflict);
        }

        return UpdateSingleCard(index, card, player);
    }

    private CardPostResult UpdateSingleCard(int index, CardInput card, Player player)
    {
        var definition = player.Cards[index] with
        {
            Name = card.Name,
            Lore = card.Lore,
            Cost = card.Cost,
            Attack = card.Attack,
            Health = card.Health,
            Script = card.Script
        };

        CardBalancer.UsageSummary? balance = null;
        var validation = cardBalancer.ValidateDefinition(definition, out var preventsBalanceCalc);
        if (!preventsBalanceCalc)
        {
            balance = cardBalancer.CalculateCardBalance(definition);
            definition = definition with
            {
                Description = GenerateCardDescription(definition)
            };
        }

        if (validation.DefinitionValid && balance is { Balanced: true })
        {
            player.UpdateCard(definition, index);
        }

        CardPostResult result = new(validation, balance, definition.Description);
        return result;
    }

    // Should later be put somewhere else but meh
    private string GenerateCardDescription(CardDefinition def)
    {
        var desc = new StringBuilder();

        static string SentenceStart(CardEvent ev)
        {
            return ev switch
            {
                CardEvent.WhenISpawn => "À l'apparition, ",
                _ => "Quand on ne sait quoi se produit, "
            };
        }

        static string ActionInSentence(CardAction act)
        {
            return act switch
            {
                DrawCardCardAction => "piochez une carte",
            };
        }

        var script = def.Script;
        if (script is not null)
        {
            foreach (var handler in script.Handlers)
            {
                desc.Append(SentenceStart(handler.Event));
                for (var i = 0; i < handler.Actions.Length; i++)
                {
                    var act = handler.Actions[i];
                    desc.Append(ActionInSentence(act));

                    // Peak programming right there
                    var dist = i - handler.Actions.Length + 1;

                    var connector = dist switch
                    {
                        0 => ".",
                        1 => " et ",
                        _ => ", "
                    };

                    desc.Append(connector);
                }

                if (handler != script.Handlers.Last())
                {
                    desc.AppendLine();
                }
            }
        }
        
        return desc.ToString();
    }
}