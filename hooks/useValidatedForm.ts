import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
// This pattern expects schemas with identical input/output types (no coercion).
export function useValidatedForm<T extends FieldValues>(schema: z.ZodType<T, T>, defaultValues: DefaultValues<T>) {
  return useForm<T>({ resolver: zodResolver(schema), defaultValues, mode: 'onBlur' });
}
