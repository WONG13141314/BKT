# Math Monopoly — Game Logic & Structure Redesign Prompt

## 🎯 Core Goal

Restructure and refactor the **gameplay logic, backend BKT engine, question generator, and state machine** for **Math Monopoly**. 

The redesign focuses purely on **game structure, BKT mastery tracking, and vertical calculation question generation** rather than visual styling.

---

## 🔑 Key Structural & Logic Changes

### 1. 📚 BKT Mastery Skills (Strictly 4 Skills)
- **REMOVE**: `PlaceValue` and `Money` skills.
- **KEEP ONLY 4 CORE SKILLS**:
  1. **`Addition`**
  2. **`Subtraction`**
  3. **`Multiplication`**
  4. **`Division`**
- The Bayesian Knowledge Tracing (BKT) engine tracks mastery probability $P(L)$ independently for each of these 4 skills.

---

### 2. ✏️ Universal Vertical Calculation & Dynamic `(?)` Logic
- **100% Vertical Calculation**: ALL generated questions for all 4 skills MUST use vertical column layout (Addition, Subtraction, Multiplication) or vertical long-division format (Division).
- **Dynamic `(?)` Placement**: The `(?)` target box **must NOT always be the final answer**. It can appear anywhere within the calculation:
  - **Addition & Subtraction**:
    - Final sum/difference: $24 + 15 = (?)$
    - Missing top/bottom operand: $24 + (?) = 39$ or $(?) - 15 = 24$
    - Missing single digit inside an operand: $4(?) + 23 = 67$
  - **Multiplication**:
    - Missing multiplicand/multiplier: $14 \times (?) = 42$
    - Missing partial product digit: $14 \times 3 = 4(?)$
  - **Long Division (Step-by-Step)**:
    - Missing quotient digit on top: $3 \overline{) 339} = 1(?)3$
    - Missing brought-down digit: Arrow brings down digit $\rightarrow 0(?)$
    - Missing intermediate subtraction result or final remainder: $09 - 9 = (?)$

---

### 3. ⚙️ BKT Engine Difficulty Integration (`backend/src/bkt/`)
The server-side question selector picks questions based on the student's current mastery level $P(L)$:
- **Difficulty 1 (Easy, $P(L) < 0.40$)**: Simple vertical calculation with missing final answer digit.
- **Difficulty 2 (Medium, $0.40 \le P(L) < 0.75$)**: Vertical calculation with missing operand or missing internal digit (e.g., $2 + (?) = 5$ or $4(?) + 23 = 67$).
- **Difficulty 3 (Hard, $P(L) \ge 0.75$)**: Multi-step vertical calculation or step-by-step long division fill-in (missing intermediate subtraction or remainder).

---

### 4. 🔄 Server Turn Phase & State Machine Restructuring
Refactor the turn lifecycle state machine in Socket.IO and backend logic to maintain proper server-authoritative pacing:

$$\text{ROLL\_PHASE} \longrightarrow \text{MOVING} \longrightarrow \text{RESOLVE\_TILE} \longrightarrow \text{VERTICAL\_CHALLENGE} \longrightarrow \text{BKT\_UPDATE} \longrightarrow \text{NEXT\_TURN}$$

- Enforce clean server-side phase state transitions so events resolve sequentially without snapping or race conditions.

---

## 📌 Simplified Prompt Text (Ready to Copy/Paste)

```text
I am building an adaptive learning serious game for primary school mathematics titled "Math Monopoly". The game uses a server-authoritative Bayesian Knowledge Tracing (BKT) engine to track student mastery and adapt question difficulty.

I want you to restructure the core game logic, question generator, and BKT mastery system as follows:

### 1. BKT Mastery Skills (Only 4 Operations)
Remove "PlaceValue" and "Money" skills. Restructure the BKT engine to track exactly 4 math skills:
- Addition
- Subtraction
- Multiplication
- Division

### 2. Universal Vertical Calculation with Dynamic (?) Placement
- All questions generated across all 4 skills MUST use vertical column alignment or vertical long-division format.
- The "( ? )" target placeholder must NOT always be the final answer. Dynamically place the "( ? )" anywhere in the calculation:
  - Addition / Subtraction: missing answer, missing top/bottom operand (e.g. 2 + ? = 5), or missing internal digit (e.g. 4[?] + 23 = 67).
  - Multiplication: missing multiplicand, multiplier digit, or partial product digit.
  - Long Division: missing quotient digit on top, missing brought-down digit, or missing intermediate subtraction / final remainder at the bottom.

### 3. BKT Adaptive Difficulty Mapping
Map BKT mastery P(L) to question generator difficulty:
- Easy: Missing final answer digit.
- Medium: Missing operand or internal digit (e.g., 2 + ? = 5).
- Hard: Step-by-step long division intermediate fill-in or multi-digit column calculation.

### 4. Turn State Machine Pacing
Ensure backend turn phases (ROLL -> MOVING -> TILE_RESOLVE -> VERTICAL_MATH_CHALLENGE -> BKT_UPDATE -> TURN_END) execute in a clean, server-authoritative sequence with proper step delays.
```
