# Stage 5a stopped: first CI gate miss

PR [#26](https://github.com/evangelistalab/vibemol/pull/26), frozen head `41363b608592991afcaf6c7a501efd86885040f2`, remains unmerged. [CI39086927339 attempt1](https://github.com/evangelistalab/vibemol/actions/runs/39086927339) independently reproduces **33/4/37**.

The extra failure is `edit_tool.py` at the **320px** `.wb-tools.scrollWidth <= .clientWidth +1` assertion tracked by #21. This run logs only the viewport width, so scrollWidth/clientWidth at the assertion are **unknown**. The earlier12/442 collapse measurement belongs to diagnostic39034319620; it is not new measurement here. The screenshot was taken after failure and does not recover the assertion-time dimensions. No causal diagnosis of a trajectory regression or new flake classification is claimed.

The ordinary required conjunction is false. The accepted failing set remains three, and no rerun or merge occurred. Numeric comparands must be instrumented before any future diagnostic; a diagnostic cannot become the merge gate.

| Item | Actual result |
| --- | --- |
| Accepted integration |83024dd,262 tracked app lets; unchanged |
|5a candidate |260 app lets;8 genuine used dependencies;27 moved implementations |
| Required construction order |Passed;29 app bindings/129 module bindings; no unresolved early read |
| Instance timing |Construction1207–1216; conservative activation bound after inert construction at1216 |
| Source audit |1,220 checks; all1,172 original declarations accounted for;1,143 others byte-exact |
| Goldens |102 unchanged captures twice; exact serialized repeat; zero diagnostic pixel differences |
| Identity |52 slots in8 contexts; WB47 live+5 known-absent /legacy48+4; every minimum passed |
| Actual identity reasons |Presented39/32, modes408/9 (404/6 observer checks), panels774–1124, DOM3101–5465, restore1 each |
| Checks and WebKit |433 JS/34 Python and WebKit passed |
| #11 |Unchanged trajectory failure after second download; vibration export not reached |
| Looks |1,794.63s/29.91min; BOTH Studio/Properties material families completed; no material-preset timeout this covered run; risk open |
| Sharded wall time |1,969s/32.8167min versus132.93min:75.31% reduction/4.051×;8 cold-cache misses |
| Actual CI renderer |Linuxx86_64, Chromium156.0.8078.4, Playwright1.64.0, ANGLE Vulkan SwiftShader(Subzero) |
| Later work |5b vibration,5c symmetry, standalone verification and0.10.0 release NOT started |

Periodic-table remains11 used factory inputs; PubChem13.5b/5c retain their accepted **projected**, unimplemented13/11-input boundaries. #11's mirror hypothesis remains refuted.

Carried priorities: **#25 silent partial appearance restore**, then **#21 unusable Edit-toolbar layout collapse**, both ahead of **#17 Metal popovers**. Other carried defects remain #3, #11, axis Escape and Coordinates Delete (#4), with follow-ups#5/#14/#15. The material-preset intermittent remains open. No carried finding enlarges the accepted CI failing set.

All ten original artifact ZIP digests/CRC, all eleven checkout logs, checkout merge `e2652a4365aa99f210f4884a3daa16fe88336703`, its parents[83024dd,41363b6], and tree `78a1a75b7783077587813a93d1eec979565f3ecf` were independently checked. All37 raw suite outputs and the four raw failures were read; both shipped joins were independently reconstructed. The55,637,692-byte archive contains342 verified entries, SHA256 `253c3249cdeb48bd6a078d13d095b6249dcd178c15c3a57f52a8cfc1b98e0d70`; it is explicitly **not usable as merge acceptance**. Full generated originals stay under ignored `out/test-artifacts/stage5/trajectory/ci-39086927339/`. This branch stores durable readbacks and source/run provenance only; its runtime is exactly the accepted Stage4 integration.
