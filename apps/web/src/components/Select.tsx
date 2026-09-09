'use client';

import { useId } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

/** Presentation only: callers own the available values and every selection effect. */
export function Select({
  value,
  onValueChange,
  options,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  disabled = false,
  className,
  compact = false,
}: SelectProps) {
  const descriptionId = useId();
  const selected = options.find((option) => option.value === value);

  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className={[styles.trigger, compact && styles.compact, className].filter(Boolean).join(' ')}
      >
        <span className={styles.value}>
          {/* Explicit text keeps the initial server render and hydration identical. */}
          <SelectPrimitive.Value placeholder="Choose an option">{selected?.label}</SelectPrimitive.Value>
        </span>
        <SelectPrimitive.Icon className={styles.chevron}>
          <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={styles.content}
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          avoidCollisions
        >
          <SelectPrimitive.ScrollUpButton className={styles.scrollButton}>
            <ChevronUp size={16} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className={styles.viewport}>
            {options.map((option, index) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                textValue={option.label}
                aria-describedby={option.description ? `${descriptionId}-${index}` : undefined}
                className={styles.item}
              >
                <span className={styles.optionText}>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.description && <span id={`${descriptionId}-${index}`} className={styles.description}>{option.description}</span>}
                </span>
                <SelectPrimitive.ItemIndicator className={styles.indicator}>
                  <Check size={16} strokeWidth={2} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className={styles.scrollButton}>
            <ChevronDown size={16} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
