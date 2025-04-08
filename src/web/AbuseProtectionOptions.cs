namespace CardLab;

public class AbuseProtectionOptions
{
    public const string Section = "AbuseProtection";

    public RateLimit GeneralLimit { get; set; } = new();
    public RateLimit GameCreationLimit { get; set; } = new();
    public RateLimit CardUploadLimit { get; set; } = new();

    public bool IncludeLoopbackIPs { get; set; } = false;
}

public class RateLimit
{
    public int WindowSeconds { get; set; } = -1;
    public int MaxRequests { get; set; } = -1;
}