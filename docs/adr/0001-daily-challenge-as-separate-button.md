# Daily challenge is a separate button, not a third mode in the Classic/Updated toggle

Daily challenge changes the RNG seed source, not the visual or audio behaviour of the game — it is not a "mode" in the same sense as Classic vs Updated. Adding it to the mode cycle would misrepresent what the toggle does and would prevent playing daily challenge in either visual style. Instead, a dedicated `📅 Daily` button activates it: pressing it locks Updated mode (daily runs require jitter and obstacle variety to be meaningful), hides the Classic/Updated toggle while active, and deactivates on the next free-play run.

## Considered options

**Third mode (Classic → Updated → Daily):** Simpler UI surface — one toggle handles everything. Rejected because daily challenge is orthogonal to visual mode, not a progression of it. It also prevents a future "daily in classic" option if that ever becomes desirable.
