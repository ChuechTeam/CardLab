using CardLab.Game.Communication;

namespace CardLab.Game.Duels;

public sealed class DuelMessageRouting(Duel duel)
{
    public void ReceiveMessage(PlayerIndex player, LabMessage message)
    {
        lock (duel.Lock)
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
                case DuelUseCardPropositionMessage req when duel.State.Cards.TryGetValue(req.CardId, out var card):
                {
                    // temporary code, will be better later
                    if (card is UnitDuelCard)
                    {
                        if (req.ChosenSlots.Length == 0)
                        {
                            SendFailure(player, req.Header, "No slots chosen");
                            return;
                        }
                        var slot = req.ChosenSlots[0];
                        if (slot.Player != player)
                        {
                            SendFailure(player, req.Header, "Slot not owned by player");
                            return;
                        }

                        PrepareAck(player, req.Header);
                        
                        var result = duel.PlayUnitCard(player, req.CardId, slot.Vec);
                        if (result.FailedWith(out var err))
                        {
                            SendFailure(player, req.Header, err);
                        }
                    }
                    else
                    {
                        throw new NotImplementedException("what's this??");
                    }

                    break;
                }
                case DuelUseCardPropositionMessage req:
                    SendFailure(player, req.Header, "Card not found.");
                    break;
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
        duel.AckPostMutation = null;
        duel.SendMessage(player, new DuelRequestFailedMessage(header.RequestId, msg));
    }
    
    private void PrepareAck(PlayerIndex player, DuelRequestHeader header)
    {
        duel.AckPostMutation = (player, new DuelRequestAckMessage(header.RequestId));
    }
}