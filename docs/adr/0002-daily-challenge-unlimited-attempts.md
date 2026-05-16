# Daily challenge allows unlimited attempts per day

The Wordle pattern (one attempt, then locked out) was considered and rejected. Limiting to one attempt adds friction, requires tracking "already played today" in localStorage, and punishes players who die early to a bad RNG gap. The replayability goal is met by tracking a separate daily best — players are pulled back by wanting to beat today's sequence, not by scarcity. Unlimited attempts also sidesteps the "I accidentally hit space" problem that would waste the day's run.
