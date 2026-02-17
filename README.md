Can be played on a phone if you view 'Desktop Site', though not recommended.
Use the fullscreen toggle to play on a tablet.

1. Core Concept
log(OS) is a hybrid spatial word game and logic circuit builder. The intent is to hide a programming layer beneath an acrostic word-game. The 11x11 board contains hidden Operators (IF, THEN, AND, OR, PLUS, MINUS, MULT, OVER) fixed at specific coordinates.

As players place words, they aren't just scoring points for the letters; they are "compiling" a logic program based on which words cover which operators.

2. Mechanics
    Tile Placement: Standard crossword style (connecting to existing tiles) or Mode Switch to Go style.

    Logic Phrases: The app scans the grid to convert word placements into a structured list of operations (e.g., IF [WORD_A] THEN [WORD_B] PLUS [WORD_C]).

3. The Scoring System
The scoring is split into two distinct parts:

   Base Score: Standard summation of letter values for words formed in the current turn.

   Compilation: The board state is compiled into a ruleset sequence based on logic order of operations.
   

   Action Calculation: The system calculates a hidden value based on the "Action" operators.

   Triggers (IF / OR): The words covering IF and OR tiles act as Triggers.

   THEN <Word>: Sets the base value (Score of Word).

   PLUS/AND <Word>: Adds to the value.

   MULT <Word>: Multiplies the value.

   OVER <Word>: Divides the value.


Execution: If a player places a new word anywhere on the board that matches a Trigger word, the cascadeOutcome is added to their score.

In summary: Players use the board to "program" a high-value function (e.g., IF "CAT" THEN "DOG" (5pts) MULT "SKY" (10pts) = 50pts). They then "call" that function later by playing the word "CAT" again elsewhere to instantly gain the stored 50 points.
