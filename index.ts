import { render, html } from "uhtml";
import { define, attr, handle, reactive } from "./decorators";
import { int } from "./attributeTransformers";

@define("counter-element")
class CounterElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  @attr(int({ min: 0, max: 9000 }), { default: true })
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
        <button class="plus">+${this.step}</button>
        <button class="minus">-${this.step}</button>
      `
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "counter-element": CounterElement;
  }
}
