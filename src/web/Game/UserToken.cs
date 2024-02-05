using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace CardLab.Game;

[InlineArray(Num)]
public struct UserToken
{
    // 24 bytes of entropy seems enough for a small little funny game no?
    private const int Num = 3;
    private const int ChPerBlock = 11; // ceil(64/6)
    private const int Chars = ChPerBlock * Num;

    private ulong _value;

    public static UserToken Generate()
    {
        UserToken token = new();
        RandomNumberGenerator.Fill(MemoryMarshal.Cast<ulong, byte>(token));
        return token;
    }

    // We need to convert the token to a string, and do the opposite too.
    // The token string will be little-endian (char[i] = byte[i]),
    // and encoded with a 64-character alphabet.
    // It's literally base64 encoding, but with our own sauce :)
    
    // One thing to keep in mind: with this encoding, the last character of each 64-bit block
    // (as it us a ulong) will only use 4 bits instead of 6, but that's not so much space wasted.

    // Alphabet: A-Z, a-z, 0-9, _, - = 64 characters. (and that avoids a lot of pain with integer division/overflow)
    private static string _alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

    // Before using this array, we need to make sure that the char is in the range [0, 255].
    // As per utf16 encoding.
    private static byte[] _lookup = new byte[256]; // if we ever get 255 = invalid

    static UserToken()
    {
        // Prepare the lookup array to be a lookup table for:
        //   { _alphabet[i] => i }
        Array.Fill(_lookup, (byte)255);
        for (byte i = 0; i < 64; i++)
        {
            _lookup[_alphabet[i]] = i;
        }
    }

    public override string ToString()
    {
        StringBuilder sb = new(Chars);

        for (int i = 0; i < Num; i++)
        {
            ulong value = this[i];

            for (int j = 0; j < ChPerBlock; j++)
            {
                ulong index = value % 64;
                value /= 64;

                sb.Append(_alphabet[(int)index]);
            }
        }

        return sb.ToString();
    }

    public static bool TryParse(string str, out UserToken token)
    {
        token = new UserToken();

        // We need exactly Chars characters.
        if (str.Length != Chars)
        {
            return false;
        }

        for (int i = 0; i < Num; i++)
        {
            for (int j = 0; j < ChPerBlock; j++)
            {
                char ch = str[i * ChPerBlock + j];

                // This character is not in the alphabet.
                if (ch > 255 || _lookup[ch] == 255)
                {
                    return false;
                }

                // Offset the value by 6*j bits.
                var val = (ulong)_lookup[ch] << 6 * j;
                token[i] |= val;
            }
        }

        return true;
    }

    public bool Equals(UserToken other)
    {
        bool eq = true;
        for (int i = 0; i < Num; i++)
        {
            eq &= this[i] == other[i];
        }

        return eq;
    }

    public override bool Equals(object? obj)
    {
        return obj is UserToken other && Equals(other);
    }

    public override int GetHashCode()
    {
        return HashCode.Combine(this[0], this[1], this[2]);
    }

    public static bool operator ==(UserToken left, UserToken right)
    {
        return left.Equals(right);
    }

    public static bool operator !=(UserToken left, UserToken right)
    {
        return !left.Equals(right);
    }
}