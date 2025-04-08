using System.Collections.Immutable;
using System.Diagnostics;
using CardLab.Game.Communication;

namespace CardLab.Game;

public sealed class Player(GameSession session, int id)
{
    // The id of the player in the current session.
    public int Id { get; } = id;

    public required string Name { get; init; }

    public required UserToken LoginToken { get; init; }

    public UserSocket Socket { get; } = new();

    // -- Mutable state --

    public ImmutableArray<CardDefinition> Cards { get; set; } = ImmutableArray<CardDefinition>.Empty;

    public ImmutableArray<SessionCardPackingInfo> CardPackInfos { get; private set; } = ImmutableArray<SessionCardPackingInfo>.Empty;

    public ImmutableArray<bool> ReadyCards { get; private set; } = ImmutableArray<bool>.Empty;

    public ImmutableArray<bool> PendingCardUploads { get; private set; } = ImmutableArray<bool>.Empty;

    public bool Kicked { get; set; } = false;

    public int Score { get; set; } = 0; // Number of wins

    // True if the player has quit the game.
    public bool Gone { get; set; } = false;
    
    // -- Functions --

    public void PrepareCardArrays(int cardCount)
    {
        Cards = [..Enumerable.Range(0, cardCount).Select(_ => new CardDefinition())];
        CardPackInfos = [..Enumerable.Range(0, cardCount).Select(i =>
        {
            var path = session.CardImageAssetPath(Id, i);
            var cid = GameSession.PackCardId(Id, i);
            return new SessionCardPackingInfo(path, cid);
        })];
        ReadyCards = [..Enumerable.Range(0, cardCount).Select(_ => false)];
        PendingCardUploads = [..Enumerable.Range(0, cardCount).Select(_ => false)];
    }

    public Result<Unit> UpdateCard(CardDefinition cardDefinition, int index)
    {
        if (index >= Cards.Length || index < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(index));
        }
        
        lock (session.Lock)
        {
            if (!session.AllowedCardUpdates.def)
            {
                return Result.Fail("Card updates are disabled.");
            }

            Cards = Cards.SetItem(index, cardDefinition);
            if (!ReadyCards[index])
            {
                ReadyCards = ReadyCards.SetItem(index, true);
            }
        }

        return Result.Success();
    }

    public Result<CancellationToken> BeginCardUpload(int cardIndex)
    {
        if (cardIndex >= Cards.Length || cardIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(cardIndex));
        }

        lock (session.Lock)
        {
            if (PendingCardUploads[cardIndex])
            {
                return Result.Fail<CancellationToken>("Card already marked as pending");
            }

            if (!session.AddOngoingCardUpload())
            {
                return Result.Fail<CancellationToken>("Uploads disabled.");
            }

            PendingCardUploads = PendingCardUploads.SetItem(cardIndex, true);
            return Result.Success(session.UploadsCancellationToken);
        }
    }

    public Result<Unit> EndCardUpload(int cardIndex)
    {
        if (cardIndex >= Cards.Length || cardIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(cardIndex));
        }

        lock (session.Lock)
        {
            if (!PendingCardUploads[cardIndex])
            {
                return Result.Fail<Unit>("Card is not pending.");
            }

            PendingCardUploads = PendingCardUploads.SetItem(cardIndex, false);
            session.RemoveOngoingCardUpload(); // Ignore failures?
        }

        return Result.Success();
    }
}