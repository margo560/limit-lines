# limit-lines

A mod that draws usage as lines (bars). A compact row above the prompt shows context fill and the account's rate-limit windows (5h, 7d) as coloured percentages. The `/limits` command opens a pane with full bars, tokens left in the context window and a cost estimate. Data comes from `$.session.usage()`, so no setup is needed. Colours follow the theme: green below 70%, yellow 70-89%, red from 90%.
