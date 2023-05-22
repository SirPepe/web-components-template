export type ClassAccessorDecorator<T, V, R extends ClassAccessorDecoratorResult<unknown, unknown> | void = ClassAccessorDecoratorResult<T, V>> = (
  target: ClassAccessorDecoratorTarget<T, V>,
  context: ClassAccessorDecoratorContext<T, V>
) => R;
