using System.Collections.Immutable;
using System.Diagnostics;
using System.Runtime.InteropServices;
using CardLab.Game.AssetPacking;

namespace CardLab.Game;

// Contains all functions necessary to organize a game session 
public static class GameSessionRules
{
    // In order to avoid surprises with decks having a ton of cards.
    // This 0.75 value limits the number of spells to 3x the number of player cards. 
    public const double MaxSpellProportion = 0.75;

    // Just to avoid overallocating on the stack.
    public const int StackAllocMaxNum = 2048;

    // Assuming player cards won't change!
    public static List<(CardDefinition, SessionCardPackingInfo)> MakeFinalCardList(
        IEnumerable<Player> players,
        int numCardPerPlayer)
    {
        // Step 1. Gather all cards that are ready 
        var list = new List<(CardDefinition def, SessionCardPackingInfo)>();
        foreach (var player in players)
        {
            for (var i = 0; i < numCardPerPlayer; i++)
            {
                if (player.ReadyCards[i])
                {
                    list.Add((player.Cards[i], player.CardPackInfos[i]));
                }
            }
        }

        // From now on we can just use a span since the list length won't change.
        // It allows us to do by-ref updates on tuples. 
        var listSpan = CollectionsMarshal.AsSpan(list);
        var numCards = listSpan.Length;

        // Step 2: Harmonize all archetypes so they all refer to the same user-friendly string 
        //         so we make sure that all archetypes use the same diacritics
        //         Example : Etudiant & Étudiant --> all Etudiant
        //                                           OR all Étudiant
        //                                           (depends on which card goes first)
        // normalized -> user-friendly
        var archetypeMap = new Dictionary<string, string>();
        var newCardArchs = new string?[list.Count];
        for (var i = 0; i < numCards; i++)
        {
            var (def, _) = listSpan[i];
            if (def.NormalizedArchetype != null)
            {
                if (archetypeMap.TryGetValue(def.NormalizedArchetype, out var existing))
                {
                    newCardArchs[i] = existing;
                }
                else
                {
                    // null def.Archetype is supposed to be impossible there...
                    var canonical = def.Archetype ?? def.NormalizedArchetype;
                    newCardArchs[i] = canonical;
                    archetypeMap.Add(def.NormalizedArchetype, canonical);
                }
            }
        }

        // Step 3: Update card descriptions, as they might refer to archetypes names,
        //         and directly apply changes
        for (var i = 0; i < numCards; i++)
        {
            ref var entry = ref listSpan[i];
            ref var updatedArch = ref newCardArchs[i];

            entry.def = entry.def with
            {
                Description = CardModule.LangFR.GenerateCardDescription(entry.def, archetypeMap),
                Archetype = updatedArch
            };
        }

        // Step 4: rest :)
        return list;
    }

    // Builds decks for N players.
    // Decks are built with the following requirements:
    // - The deck contains all cards created by players; with one ore more copies.
    // - The deck contains X% of spells (as per the settings)
    //   Spells are chosen randomly from the base pack, each player has a unique set of spells.
    // - The deck contains sequences of M cards that are of the same archetype.
    //   Those sequences can be "interrupted" by spells and archetype-less cards,
    //   but the archetype will still be the same.
    public static ImmutableArray<QualCardRef>[]
        MakeNDecks(GamePack sessionPack, GamePack basePack, int n, ref readonly DeckSettings settings)
    {
        const uint noCard = uint.MaxValue;
        const int noPacket = -1;

        // First, we need to know how much cards we're going to have.
        var sesCopies = Math.Clamp(settings.UserCardCopies, 1, 20);
        var numSes = sessionPack.Cards.Length * sesCopies;
        var spellProp = settings.SpellProportion;
        var numArchSeq = Math.Max((ushort)1, settings.ArchetypeSequenceLength);

        // We need to find how much spells we want...
        // As per the settings, we want the deck to have sp% spells. So, (sp in ]0, 1[, you get it)
        // | tot = numSes + numSpell
        // | sp*tot = numSpell
        // ==> sp*(numSes+numSpell)=numSpell
        // ==> sp*numSes=(1-sp)*numSpell
        // ==> ((sp)/(1-sp))*numSes=numSpell
        // ==> ((sp-1+1)/(1-sp))*numSes=numSpell   [for readability]
        // ==> (1/(1-sp) - 1)*numSes=numSpell      [for readability]
        //
        // And we're done! Just remember to round the number so we get an integer and we're good to go!

        int numSpell;
        if (spellProp <= 0)
        {
            numSpell = 0;
        }
        else
        {
            double sp = Math.Min(MaxSpellProportion, spellProp);
            double numSpellFloat = (1 / (1 - sp) - 1) * numSes;
            numSpell = Math.Max(0, (int)Math.Round(numSpellFloat));
        }

        var numTot = numSes + numSpell;

        // Now, we need to classify cards by archetype. (Id in session pack)
        // Performance could be much better if we had ids instead of strings to compare, but that's for later.
        int numArchPackets = 0;
        var archCards = new Dictionary<string, List<uint>>();
        Span<uint> nonArchCards = numSes <= StackAllocMaxNum ? stackalloc uint[numSes] : new uint[numSes];
        int numNonArch = 0;
        foreach (var card in sessionPack.Cards)
        {
            var def = card.Definition;
            if (def.NormalizedArchetype != null)
            {
                if (!archCards.TryGetValue(def.NormalizedArchetype, out var list))
                {
                    list = new List<uint>();
                    archCards.Add(def.NormalizedArchetype, list);
                }

                for (int i = 0; i < sesCopies; i++)
                {
                    list.Add(card.Id);
                    // If we just added to the seq+1'th element, it means we got a new packet.
                    if (list.Count % numArchSeq == 1)
                    {
                        numArchPackets++;
                    }
                }
            }
            else
            {
                for (int i = 0; i < sesCopies; i++)
                {
                    nonArchCards[numNonArch] = card.Id;
                    numNonArch++;
                }
            }
        }

        nonArchCards = nonArchCards[..numNonArch];

        // Then, we'll make "packets" of cards that are of the same archetype.
        // The seqPackets span will contain sequences of cards that are of the same archetype.
        // If there's not enough cards, the id will be UINT32_MAX.
        var packLen = numArchPackets * numArchSeq;
        Span<uint> seqPackets = packLen <= StackAllocMaxNum ? stackalloc uint[packLen] : new uint[packLen];
        int iSeq = 0;
        foreach (var sameArch in archCards.Values)
        {
            var remainder = numArchSeq - sameArch.Count % numArchSeq;
            if (remainder == numArchSeq)
            {
                // Then sameArch is a multiple of numArchSeq
                remainder = 0;
            }
            for (var i = 0; i < sameArch.Count; i++)
            {
                seqPackets[iSeq] = sameArch[i];
                iSeq++;
            }

            for (int i = 0; i < remainder; i++)
            {
                seqPackets[iSeq] = noCard;
                iSeq++;
            }
        }

        // Spells don't use pools since they are unique to each player.
        // There could be more spells than numSpells, so overallocate a bit, we'll slice after
        int spellsInPack = basePack.Cards.Length;
        Span<uint> spellCards =
            spellsInPack <= StackAllocMaxNum ? stackalloc uint[spellsInPack] : new uint[spellsInPack];
        int numSpellCards = 0;
        foreach (var asset in basePack.Cards)
        {
            if (asset.Definition.Type == CardType.Spell)
            {
                spellCards[numSpellCards] = asset.Id;
                numSpellCards++;
            }
        }

        spellCards = spellCards[..numSpellCards];
        
        // Find all the cards from the session pack that are compatible with the bias settings.
        HashSet<uint> biasCompatible = new();
        if (settings.BiasMaxCost >= 0)
        {
            foreach (var card in sessionPack.Cards)
            {
                if (card.Definition.Cost <= settings.BiasMaxCost)
                {
                    biasCompatible.Add(card.Id);
                }
            }
        }
        
        // configure more bias stuff
        var bmx = settings.BiasMaxCost;
        var bdt = Math.Min(settings.BiasDeckTopSpan, numTot);
        var bg = Math.Min(settings.BiasGuaranteed, bdt);
        Pool<int> topDeckIndicesPool = new(bdt <= StackAllocMaxNum ? stackalloc int[bdt] : new int[bdt], true);

        // Now we can finally create all the arrays and pools we need.
        // Pool of indices to the packet array.
        Pool<int> archPacketPool = new(numArchPackets <= StackAllocMaxNum
            ? stackalloc int[numArchPackets]
            : new int[numArchPackets], true);
        // Pools of card ids.
        Pool<uint> nonArchPool = new(numNonArch <= StackAllocMaxNum
            ? stackalloc uint[numNonArch]
            : new uint[numNonArch], true);

        var decks = new QualCardRef[n][];
        var random = new Random();
        for (int i = 0; i < n; i++)
        {
            // Reset any state from the previous run.
            for (int j = 0; j < numArchPackets; j++)
            {
                archPacketPool.Span[j] = j * numArchSeq;
            }

            archPacketPool.Refilled();

            nonArchCards.CopyTo(nonArchPool.Span);
            nonArchPool.Refilled();

            var remainingSpellCards = numSpell;

            var deck = decks[i] = new QualCardRef[numTot];
            int curPacketStart = archPacketPool.Num == 0 ? noPacket : archPacketPool.Pick(random);
            int curPacketEl = 0;
            for (int j = 0; j < numTot; j++)
            {
                int remaining = numTot - j - 1;
                int rnd = random.Next(remaining);

                // First try picking up a spell card.
                if (remainingSpellCards > 0 && rnd < remainingSpellCards)
                {
                    deck[j] = new QualCardRef(basePack.Id, spellCards[random.Next(numSpellCards)]);
                    remainingSpellCards--;
                    continue;
                }

                // Else, try picking up a non-archetype card.
                rnd -= remainingSpellCards;
                if (nonArchPool.Num > 0 && rnd < nonArchPool.Num)
                {
                    deck[j] = new QualCardRef(sessionPack.Id, nonArchPool.Pick(rnd));
                    continue;
                }

                // Otherwise, this is where we take a card from the same-archetype packet.
                Debug.Assert(curPacketStart != noPacket);

                deck[j] = new QualCardRef(sessionPack.Id, seqPackets[curPacketStart + curPacketEl]);
                Debug.Assert(sessionPack.CardMap.ContainsKey(deck[j].CardId));
                curPacketEl++;

                // Switch to a new packet if this one is depleted.
                if (curPacketEl >= numArchSeq || seqPackets[curPacketStart + curPacketEl] == noCard)
                {
                    curPacketStart = archPacketPool.Num == 0 ? noPacket : archPacketPool.Pick(random);
                    curPacketEl = 0;
                }
            }
            
            // Now, we need to apply any bias.
            if (bmx >= 0 && bdt > 0 && bg > 0)
            {
                List<int> lowCostIndices = new();
                for (var j = 0; j < deck.Length - bdt; j++)
                {
                    ref var qualCardRef = ref deck[j];
                    if (qualCardRef.PackId == sessionPack.Id && biasCompatible.Contains(qualCardRef.CardId))
                    {
                        lowCostIndices.Add(j);
                    }
                }

                var guaranteed = Math.Min(bg, lowCostIndices.Count);
                
                for (int j = 0; j < bdt; j++)
                {
                    topDeckIndicesPool.Span[j] = numTot - j - 1;
                }
                topDeckIndicesPool.Refilled();

                for (int j = 0; j < guaranteed; j++)
                {
                    var topIdx = topDeckIndicesPool.Pick(random);
                    
                    // Already a low cost card, skip it.
                    if (deck[topIdx].PackId == sessionPack.Id && biasCompatible.Contains(deck[topIdx].CardId))
                    {
                        continue;
                    }
                    
                    // swap with a random low cost idx
                    var lowCostIdx = lowCostIndices[random.Next(lowCostIndices.Count)];
                    (deck[topIdx], deck[lowCostIdx]) = (deck[lowCostIdx], deck[topIdx]);
                    lowCostIndices.Remove(lowCostIdx);
                }
            }
        }
        
        // Phew, we can now transform those into immutable arrays

        var immut = new ImmutableArray<QualCardRef>[n];
        for (int i = 0; i < n; i++)
        {
            immut[i] = ImmutableCollectionsMarshal.AsImmutableArray(decks[i]);
        }

        return immut;
    }

    public static (Player, Player)[] AssociatePlayersInAFairDuel(Span<Player> players, out Player? loner)
    {
        // fairness? nope, it's just random
        var numPlayers = players.Length;
        var numPairs = numPlayers / 2;
        var pairs = new (Player, Player)[numPairs];
        var indicesPool =
            new Pool<int>(numPlayers <= StackAllocMaxNum ? stackalloc int[numPlayers] : new int[numPlayers], true);
        for (var i = 0; i < players.Length; i++)
        {
            indicesPool.Span[i] = i;
        }

        indicesPool.Refilled();

        var random = new Random();
        for (var i = 0; i < numPairs; i++)
        {
            pairs[i] = (players[indicesPool.Pick(random)], players[indicesPool.Pick(random)]);
        }

        loner = indicesPool.Num == 0 ? null : players[indicesPool.Span[0]];
        return pairs;
    }

    // if randomize is false, the array will be filled in order.
    public static int[] DistributeCardCosts(int numCards, ref readonly CostSettings settings, bool randomize = true)
    {
        var rnd = new Random();

        var highNum = numCards / 2;
        var lowNum = numCards - highNum;

        var lowPool = new Pool<int>(lowNum <= StackAllocMaxNum ? stackalloc int[lowNum] : new int[lowNum], true);
        var highPool = new Pool<int>(highNum <= StackAllocMaxNum ? stackalloc int[highNum] : new int[highNum], true);

        FillPool(ref lowPool, settings.LowWeights, 1);
        FillPool(ref highPool, settings.HighWeights, 1 + settings.LowWeights.Length);

        var costs = new int[numCards];
        if (randomize)
        {
            // Parity check:
            // If numCards is odd, we start with the low pool, since N_low = N_high + 1
            // If numCards is even, then it doesn't change anything, N_low = N_high
            for (int i = 0; i < numCards; i++)
            {
                if (i % 2 == 0)
                {
                    costs[i] = lowPool.Pick(rnd);
                }
                else
                {
                    costs[i] = highPool.Pick(rnd);
                }
            }
        }
        else
        {
            int i = 0;
            foreach (var v in lowPool.Span)
            {
                costs[i++] = v;
            }

            foreach (var v in highPool.Span)
            {
                costs[i++] = v;
            }
        }

        return costs;

        static void FillPool(ref Pool<int> p, ImmutableArray<int> weights, int costStart)
        {
            var cNum = p.Span.Length;
            var wNum = weights.Length;

            int wtot = 0;
            foreach (var w in weights)
            {
                wtot += w;
            }

            // First, we do some sort of pessimistic distribution: we calculate the proportion of items
            // of the same cost, then we add its "guaranteed" minimum to the pool.
            // We use integer arithmetic, as it's sufficient and provides safe guarantees over
            // floating point arithmetic.

            // This array gives us the fractional part of missing elements, multiplied by wTot
            // (similar to fixed-point arithmetic).
            // remainingElements[i] = floor(el[i]) * wNum
            Span<int> remainingElements = wNum <= StackAllocMaxNum ? stackalloc int[wNum] : new int[wNum];
            int filled = 0;

            for (var i = 0; i < wNum; i++)
            {
                var weight = weights[i];
                var cost = costStart + i;

                // percentage = weight/wtot
                // elements = percentage*cNum
                // Reorder the formula to avoid floating point arithmetic AND integer truncation.

                var elements = (cNum * weight) / wtot;
                remainingElements[i] = (cNum * weight) % wtot;

                for (int j = 0; j < elements; j++)
                {
                    p.Span[filled] = cost;
                    filled++;
                }
            }
            
            // Then, we'll pick the remaining elements, by order of fractional part.

            // Remain is guaranteed to be in [0, cNum]. The proof is left as an exercise to the reader. 
            int remain = cNum - filled;
            for (int i = 0; i < remain; i++)
            {
                // Find the element with the maximum fractional part and add it to the pool.
                int wMaxIdx = 0;
                float wMaxVal = remainingElements[0];
                for (int j = 1; j < wNum; j++)
                {
                    if (remainingElements[j] > wMaxVal)
                    {
                        wMaxIdx = j;
                        wMaxVal = remainingElements[j];
                    }
                }

                p.Span[filled] = costStart + wMaxIdx;
                filled++;
                remainingElements[wMaxIdx] = 0;
            }

            p.Refilled();
        }
    }

    public record struct DeckSettings
    {
        // How many cards in a row should be of the same archetype in a player's deck
        public required ushort ArchetypeSequenceLength { get; set; }

        // The percentage of the deck being filled with random spells from the base pack.
        // in [0, MaxSpellProportion]
        public required double SpellProportion { get; set; }

        public required int UserCardCopies { get; set; }
        
        // Bias Settings
        public required int BiasMaxCost { get; set; }
        public required int BiasDeckTopSpan { get; set; }
        public required int BiasGuaranteed { get; set; }
    }

    public record struct CostSettings
    {
        // First element: weight for cost 1
        // N-th element: weight for cost N

        // Low: [1, 5]
        public ImmutableArray<int> LowWeights { get; set; }

        // High: [6, 10]
        public ImmutableArray<int> HighWeights { get; set; }

        public static CostSettings Symmetric(params int[] low)
        {
            var lowBuilder = ImmutableArray.CreateBuilder<int>(low.Length);
            var highBuilder = ImmutableArray.CreateBuilder<int>(low.Length);

            for (int i = 0; i < low.Length; i++)
            {
                lowBuilder.Add(low[i]);
                highBuilder.Add(low[low.Length - i - 1]);
            }

            return new CostSettings
            {
                LowWeights = lowBuilder.ToImmutable(),
                HighWeights = highBuilder.ToImmutable()
            };
        }
    }

    private ref struct Pool<T>(Span<T> span, bool depleted)
    {
        public readonly Span<T> Span = span;
        public int Num = depleted ? 0 : span.Length;

        public void Refilled()
        {
            Num = Span.Length;
        }

        public void Depleted()
        {
            Num = 0;
        }

        public T Pick(Random rnd)
        {
            return Pick(rnd.Next(Num));
        }

        public T Pick(int idx)
        {
            if (Num == 0)
            {
                throw new InvalidOperationException("Random pool is empty!");
            }

            var value = Span[idx];
            Span[idx] = Span[Num - 1];
            Num--;
            return value;
        }
    }
}