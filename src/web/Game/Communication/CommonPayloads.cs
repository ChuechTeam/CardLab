namespace CardLab.Game.Communication;

public record PlayerPayload(int Id, string Name);
public record DownloadablePackPayload(string DefPath, string ResPath);