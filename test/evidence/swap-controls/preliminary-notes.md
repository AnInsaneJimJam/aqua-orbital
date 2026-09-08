# Preliminary observations

- `sdk-red.txt` records the test-first missing-module failure. Four new SDK cases passed after implementing settings and Max helpers. This focused run alone is not the complete acceptance checkpoint.
- `browser-initial.txt` passed 23 of 27 checks. It was a preliminary run with live source edits, not a frozen-source claim. The deadline selector lacked an exact accessible label; `settings-before-label-fix.tsx.txt` and `deadline-label-context.md` retain that state. Its explicit label was fixed. A settings test then aged its fixed historical observation while waiting through that change; it passes in the next fresh run.
- The first observation-test migration accidentally removed the instruction that restored the original input amount after editing it. The fixture consequently returned a mismatched request and the application correctly rejected it. The test restores that input again.
- The first automatic-refresh test advanced past expiry before its in-flight refresh completed. The application rejected the resulting stale response as unavailable. The corrected test requires a changed output from the completed refresh before moving the tab clock forward. It then verifies actual expiry and reactivation.
- `initial-contexts/` retains the four original failing contexts. `browser-controls.txt` subsequently passed all nineteen settings/observation checks, including wrong-chain selection and rejected network requests. The final complete run additionally includes Max timeout recovery and all prior payment/swap/browser cases.
- The preliminary run logged one Next development hot-reload initialization error while files were being edited. The frozen run is evaluated separately; preliminary hot-reload observations do not establish a production defect or a passing release.

No runtime clock tolerance, signing freshness, calldata threshold or gas funding requirement was relaxed to make these tests pass.
