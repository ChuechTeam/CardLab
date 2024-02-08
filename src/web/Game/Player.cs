using System.Collections.Immutable;

namespace CardLab.Game;

public sealed class Player(GameSession session, int cardCount)
{
    // The id of the player in the current session.
    public required int Id { get; init; }

    public required string Name { get; init; }

    public required UserToken LoginToken { get; init; }

    public UserSocket Socket { get; } = new();

    // -- Mutable state --

    public ImmutableArray<Card> Cards { get; private set; } =
        Enumerable.Range(0, cardCount).Select(_ => new Card()).ToImmutableArray();

    public ImmutableArray<bool> PendingCardUploads { get; private set; } =
        Enumerable.Range(0, cardCount).Select(_ => false).ToImmutableArray();

    // -- Functions --

    public void UpdateCard(Card card, int index)
    {
        if (index > Cards.Length || index < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(index));
        }

        lock (session.Lock)
        {
            Cards = Cards.SetItem(index, card);
        }
    }

    public Result<Unit> BeginCardUpload(int cardIndex)
    {
        if (cardIndex > Cards.Length || cardIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(cardIndex));
        }

        lock (session.Lock)
        {
            if (PendingCardUploads[cardIndex])
            {
                return Result.Fail("Card already marked as pending");
            }

            if (session.Phase is not CreatingCardsPhase cardsPhase)
            {
                return Result.Fail("Wrong phase.");
            }

            PendingCardUploads = PendingCardUploads.SetItem(cardIndex, true);
            cardsPhase.RegisterCardUploadBegin();

            return Result.Success();
        }
    }

    public Result<Unit> EndCardUpload(int cardIndex)
    {
        if (cardIndex > Cards.Length || cardIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(cardIndex));
        }

        lock (session.Lock)
        {
            if (!PendingCardUploads[cardIndex])
            {
                return Result.Fail<Unit>("Card is not pending.");
            }

            if (session.Phase is not CreatingCardsPhase cardsPhase)
            {
                return Result.Fail("Wrong phase.");
            }

            PendingCardUploads = PendingCardUploads.SetItem(cardIndex, false);
            cardsPhase.RegisterCardUploadDone();

            return Result.Success();
        }
    }
}