namespace CardLab.Game.Duels;

// Identifiers are composed of two parts:
// - 28 high bits for the sequence number
// - 4 low bits for the type

public static class DuelIdentifiers
{
    public const int Player1 = 0b00000;
    public const int Player2 = 0b10000;
    
    public static int Create(DuelEntityType type, int seq)
    {
        // todo: checking?
        return seq << 4 | (int)type;
    }

    public static bool TryExtractType(int id, out DuelEntityType type)
    {
        type = (DuelEntityType)(id & 0b1111);
        return Enum.IsDefined(type);
    }
}