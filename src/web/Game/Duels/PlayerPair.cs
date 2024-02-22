using System.Diagnostics.CodeAnalysis;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CardLab.Game.Duels;

public record struct PlayerPair<T>
{
    // We need fields here for references

    [JsonInclude] public required T P1;

    [JsonInclude] public required T P2;

    [SetsRequiredMembers]
    public PlayerPair(T both)
    {
        P1 = both;
        P2 = both;
    }

    [SetsRequiredMembers]
    public PlayerPair(T P1, T P2)
    {
        this.P1 = P1;
        this.P2 = P2;
    }

    public PlayerPair()
    {
    }

    public void Deconstruct(out T p1, out T p2)
    {
        p1 = P1;
        p2 = P2;
    }

    public T this[int idx]
    {
        get
        {
            return idx switch
            {
                0 => P1,
                1 => P2,
                _ => throw new IndexOutOfRangeException("Player *INDEX* is not 0 or 1")
            };
        }
        set
        {
            if (idx == 0)
            {
                P1 = value;
            }
            else if (idx == 1)
            {
                P2 = value;
            }
            else
            {
                throw new IndexOutOfRangeException("Player *INDEX* is not 0 or 1");
            }
        }
    }

    public T this[PlayerIndex idx]
    {
        get => this[(int)idx];
        set => this[(int)idx] = value;
    }
}

public static class PlayerPair
{
    public static PlayerPair<T?> ForPlayer<T>(PlayerIndex idx, T val)
    {
        if (idx == PlayerIndex.P1)
        {
            return new(val, default);
        }
        else
        {
            return new(default, val);
        }
    }
}