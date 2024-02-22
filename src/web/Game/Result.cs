using Microsoft.AspNetCore.Http.HttpResults;

namespace CardLab.Game;

// The poor man's functional features in C#... And I'm not even a functional programmer (yet)

/// <summary>
/// A basic result type that can either:
/// - Succeed with a value
/// - Fail with an error message
/// </summary>
public readonly record struct Result<T>(T? Value, bool Succeeded, string? Error = null)
{
    // Currently, the error message is a non-localizable string. Later on, we should add support
    // for localizing error messages, using a type other than a string (discriminated unions come to mind).

    public bool SucceededWith(out T value)
    {
        value = Value!;
        return Succeeded;
    }

    public bool Failed => !Succeeded;

    public bool FailedWith(out string error)
    {
        error = Error!;
        return !Succeeded;
    }

    public T ThrowIfFailed()
    {
        if (Failed)
        {
            throw new InvalidOperationException(Error);
        }

        return Value!;
    }

    public Result<TOut> Map<TOut>(Func<T, TOut> f)
    {
        return Failed
            ? new Result<TOut>(default, false, Error)
            : new Result<TOut>(f(Value!), true);
    }

    public Result<T> Append(Func<T, Result<T>> f)
    {
        return Failed ? this : f(Value!);
    }
    
    public Result<T> AppendOptional(Func<T, Result<T>> f)
    {
        if (Failed)
        {
            return this;
        }
        
        var val = f(Value!);
        return val.Failed ? this : val;
    }

    public static implicit operator Result<T>(T thing) => new(thing, true);
}

public static class Result
{
    public static Result<T> Success<T>(T value) => new(value, true);
    public static Result<T> Fail<T>(string error) => new(default!, false, error);

    public static Result<Unit> Success() => new(default, true);
    public static Result<Unit> Fail(string error) => new(default, false, error);
}

// Used in conjunction with Result<T> to represent a successful operation that doesn't return a value
public readonly struct Unit
{
}