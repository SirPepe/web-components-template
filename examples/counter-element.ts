import { render, html } from "uhtml";
import { define, attr, handle, reactive } from "../lib/decorators";
import { int } from "../lib/transformers";

@define("counter-element")
export class CounterElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  @attr(int({ min: 0, max: 9000 }), { reflective: false })
  accessor value: number = 0;

  @attr(int({ min: 1 }))
  accessor step: number = 1;

  @handle("click", "button.plus")
  #increment(): void {
    this.value += this.step;
  }

  @handle("click", "button.minus")
  #decrement(): void {
    this.value -= this.step;
  }

  @reactive()
  #render() {
    render(
      this.#root,
      html`
        ${this.value}
        <button ?disabled=${this.value + this.step > 9000} class="plus">
          + ${this.step}
        </button>
        <button ?disabled=${this.value - this.step < 0} class="minus">
          - ${this.step}
        </button>
      `
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "counter-element": CounterElement;
  }
}
