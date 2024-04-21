using CardLab.Game.Communication;

namespace CardLab.Game.Duels;

public sealed class DuelMessageRouting(Duel duel)
{
    public void ReceiveMessage(PlayerIndex player, LabMessage message)
    {
        lock (duel.Lock)
        {
            try
            {
                switch (message)
                {
                    case DuelEndTurnMessage { Header: var header } when !CheckRequest(player, header):
                        return;
                    case DuelEndTurnMessage { Header: var header }:
                    {
                        PrepareAck(player, header);
                        
                        var result = duel.EndTurn(player);
                        if (result.FailedWith(out var err))
                        {
                            SendFailure(player, header, err);
                        }

                        break;
                    }
                    case DuelUseCardPropositionMessage req when !CheckRequest(player, req.Header):
                        return;
                    case DuelUseCardPropositionMessage req when duel.State.Cards.ContainsKey(req.CardId):
                    {
                        PrepareAck(player, req.Header);

                        var result = duel.PlayCard(player, req.CardId, req.ChosenSlots, req.ChosenEntities);
                        if (result.FailedWith(out var err))
                        {
                            SendFailure(player, req.Header, err);
                        }

                        break;
                    }
                    case DuelUseCardPropositionMessage req:
                        SendFailure(player, req.Header, "Card not found.");
                        break;
                    case DuelUseUnitPropositionMessage req when !CheckRequest(player, req.Header):
                        break;
                    case DuelUseUnitPropositionMessage req:
                        PrepareAck(player, req.Header);
                        var res = duel.UseUnitAttack(player, req.UnitId, req.ChosenEntityId);
                        if (res.FailedWith(out var err2))
                        {
                            SendFailure(player, req.Header, err2);
                        }
                        break;
                    case DuelControlTimer ct:
                        if (ct.Pause)
                        {
                            duel.UserPauseTurnTimer(player);
                        }
                        else
                        {
                            duel.UserUnpauseTurnTimer(player);
                        }

                        break;
                    case DuelReportReady:
                        duel.ReportPlayerReady(player);
                        break;
                }
            }
            finally
            {
                duel.AckPostMutation = null;
            }
        }
    }

    private bool CheckRequest(PlayerIndex player, DuelRequestHeader header)
    {
        var ok = header.Iteration == duel.StateIteration;
        if (!ok)
        {
            duel.SendMessage(player, new DuelRequestFailedMessage(header.RequestId, "Iteration mismatch"));
        }

        return ok;
    }

    private void SendFailure(PlayerIndex player, DuelRequestHeader header, string msg)
    {
        duel.SendMessage(player, new DuelRequestFailedMessage(header.RequestId, msg));
    }

    private void PrepareAck(PlayerIndex player, DuelRequestHeader header)
    {
        duel.AckPostMutation = (player, new DuelRequestAckMessage(header.RequestId));
    }
}