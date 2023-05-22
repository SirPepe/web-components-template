/* eslint-disable */
export type ClassAccessorDecorator<
  T,
  V,
  R extends ClassAccessorDecoratorResult<
    unknown,
    unknown
  > | void = ClassAccessorDecoratorResult<T, V>
> = (
  target: ClassAccessorDecoratorTarget<T, V>,
  context: ClassAccessorDecoratorContext<T, V>
) => R;
/* eslint-enable */

export type Handler<T, K = string> = K extends keyof HTMLElementEventMap
  ? (this: T, event: HTMLElementEventMap[K]) => void
  : (this: T, event: Event) => void;

export type HandleDecorator<T, K = string> = (
  value: Handler<T, K>,
  context: ClassMethodDecoratorContext<T, Handler<T, K>>
) => void;
