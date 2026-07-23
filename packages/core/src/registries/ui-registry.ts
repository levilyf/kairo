/**
 * UI registry — lookup only.
 * Does not render or drive a surface.
 */

import { assertUI, type UI } from "../contracts/ui.js";
import { Registry } from "./registry.js";

export class UIRegistry extends Registry<UI> {
  constructor() {
    super("ui", assertUI);
  }
}
