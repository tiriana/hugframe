import { el } from '@/playground/dom'

export interface AlphaColor {
  hex: string
  alpha: number
}

export interface Control<T> {
  readonly el: HTMLElement
  readonly default: T
  set(value: T): void
}

export function alphaColorCss(value: AlphaColor): string {
  const clean = value.hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean
  const parsed = Number.parseInt(full, 16)
  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255
  return `rgb(${r} ${g} ${b} / ${value.alpha}%)`
}

interface ShellParts {
  id: string
  label: string
  control: HTMLElement
  hint?: string
  defaultText: string
  labelIsInput?: boolean
}

function shell(parts: ShellParts): HTMLElement {
  const label = parts.labelIsInput
    ? el('label', { class: 'ctl__label', attrs: { for: parts.id }, text: parts.label })
    : el('span', { class: 'ctl__label', attrs: { id: parts.id }, text: parts.label })
  return el('div', { class: 'ctl' }, [
    el('div', { class: 'ctl__head' }, [
      label,
      el('span', { class: 'ctl__meta' }, [el('span', { text: `default ${parts.defaultText}` })]),
    ]),
    parts.control,
    parts.hint ? el('p', { class: 'ctl__hint', text: parts.hint }) : null,
  ])
}

export interface RangeSpec {
  id: string
  label: string
  min: number
  max: number
  step?: number
  value: number
  unit?: string
  hint?: string
  format?: (value: number) => string
  onInput: (value: number) => void
}

export function rangeControl(spec: RangeSpec): Control<number> {
  const format = spec.format ?? ((value: number) => `${value}${spec.unit ?? ''}`)
  const input = el('input', {
    class: 'ctl__range',
    attrs: {
      type: 'range',
      id: spec.id,
      min: spec.min,
      max: spec.max,
      step: spec.step ?? 1,
      value: spec.value,
    },
  })
  const output = el('output', {
    class: 'ctl__value',
    attrs: { for: spec.id },
    text: format(spec.value),
  })
  input.addEventListener('input', () => {
    const value = Number(input.value)
    output.textContent = format(value)
    spec.onInput(value)
  })
  return {
    el: shell({
      id: spec.id,
      label: spec.label,
      control: el('div', { class: 'ctl__inline' }, [input, output]),
      hint: spec.hint,
      defaultText: format(spec.value),
      labelIsInput: true,
    }),
    default: spec.value,
    set(value) {
      input.value = String(value)
      output.textContent = format(value)
    },
  }
}

export interface NumberSpec {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
  onInput: (value: number) => void
}

export function numberControl(spec: NumberSpec): Control<number> {
  const input = el('input', {
    class: 'ctl__text ctl__text--num',
    attrs: {
      type: 'number',
      id: spec.id,
      value: spec.value,
      min: spec.min,
      max: spec.max,
      step: spec.step ?? 1,
    },
  })
  input.addEventListener('input', () => {
    const value = Number.parseFloat(input.value)
    if (Number.isFinite(value)) spec.onInput(value)
  })
  return {
    el: shell({
      id: spec.id,
      label: spec.label,
      control: input,
      hint: spec.hint,
      defaultText: `${spec.value}${spec.unit ?? ''}`,
      labelIsInput: true,
    }),
    default: spec.value,
    set(value) {
      input.value = String(value)
    },
  }
}

export interface TextSpec {
  id: string
  label: string
  value: string
  hint?: string
  onInput: (value: string) => void
}

export function textControl(spec: TextSpec): Control<string> {
  const input = el('input', {
    class: 'ctl__text',
    attrs: { type: 'text', id: spec.id, value: spec.value, spellcheck: 'false' },
  })
  input.addEventListener('input', () => spec.onInput(input.value))
  return {
    el: shell({
      id: spec.id,
      label: spec.label,
      control: input,
      hint: spec.hint,
      defaultText: spec.value,
      labelIsInput: true,
    }),
    default: spec.value,
    set(value) {
      input.value = value
    },
  }
}

export interface ColorSpec {
  id: string
  label: string
  value: string
  onInput: (value: string) => void
}

export function colorControl(spec: ColorSpec): Control<string> {
  const input = el('input', {
    class: 'ctl__color',
    attrs: { type: 'color', id: spec.id, value: spec.value },
  })
  const output = el('output', { class: 'ctl__value', attrs: { for: spec.id }, text: spec.value })
  input.addEventListener('input', () => {
    output.textContent = input.value
    spec.onInput(input.value)
  })
  return {
    el: shell({
      id: spec.id,
      label: spec.label,
      control: el('div', { class: 'ctl__inline' }, [input, output]),
      defaultText: spec.value,
      labelIsInput: true,
    }),
    default: spec.value,
    set(value) {
      input.value = value
      output.textContent = value
    },
  }
}

export interface AlphaColorSpec {
  id: string
  label: string
  value: AlphaColor
  onInput: (value: AlphaColor) => void
}

export function alphaColorControl(spec: AlphaColorSpec): Control<AlphaColor> {
  const format = (value: AlphaColor) => `${value.hex} · ${value.alpha}%`
  const hex = el('input', {
    class: 'ctl__color',
    attrs: { type: 'color', id: spec.id, value: spec.value.hex },
  })
  const alpha = el('input', {
    class: 'ctl__range',
    attrs: {
      type: 'range',
      id: `${spec.id}-alpha`,
      min: 0,
      max: 100,
      step: 1,
      value: spec.value.alpha,
      'aria-label': `${spec.label} opacity`,
    },
  })
  const output = el('output', {
    class: 'ctl__value',
    attrs: { for: `${spec.id} ${spec.id}-alpha` },
    text: format(spec.value),
  })
  const current = (): AlphaColor => ({ hex: hex.value, alpha: Number(alpha.value) })
  const emit = () => {
    output.textContent = format(current())
    spec.onInput(current())
  }
  hex.addEventListener('input', emit)
  alpha.addEventListener('input', emit)
  return {
    el: shell({
      id: spec.id,
      label: spec.label,
      // The hex input carries the control's id, so the shell must render the
      // visible label as a <label for> rather than a span with the same id.
      labelIsInput: true,
      control: el('div', { class: 'ctl__inline' }, [hex, alpha, output]),
      defaultText: format(spec.value),
    }),
    default: spec.value,
    set(value) {
      hex.value = value.hex
      alpha.value = String(value.alpha)
      output.textContent = format(value)
    },
  }
}

export interface SwitchSpec {
  id: string
  label: string
  value: boolean
  onInput: (value: boolean) => void
}

export function switchControl(spec: SwitchSpec): Control<boolean> {
  // The shell renders the visible label as a span carrying the control's id, so
  // the input points at it with aria-labelledby rather than duplicating the id.
  const input = el('input', {
    class: 'ctl__switch-input',
    attrs: { type: 'checkbox', role: 'switch', 'aria-labelledby': spec.id },
  })
  input.checked = spec.value
  const track = el('span', { class: 'ctl__switch-track', attrs: { 'aria-hidden': 'true' } })
  const state = el('span', {
    class: 'ctl__switch-state',
    attrs: { 'aria-hidden': 'true' },
    text: spec.value ? 'on' : 'off',
  })
  input.addEventListener('change', () => {
    state.textContent = input.checked ? 'on' : 'off'
    spec.onInput(input.checked)
  })
  const label = el('label', { class: 'ctl__switch' }, [input, track, state])
  return {
    el: shell({
      id: spec.id,
      label: spec.label,
      control: label,
      defaultText: spec.value ? 'on' : 'off',
    }),
    default: spec.value,
    set(value) {
      input.checked = value
      state.textContent = value ? 'on' : 'off'
    },
  }
}

export interface SegmentOption {
  value: string
  label: string
  title?: string
}

export interface SegmentedSpec {
  id: string
  label: string
  options: readonly SegmentOption[]
  value: string
  onInput: (value: string) => void
}

export function segmentedControl(spec: SegmentedSpec): Control<string> {
  const buttons = spec.options.map((option) => {
    const button = el('button', {
      class: 'segmented__btn',
      attrs: { type: 'button', title: option.title },
      text: option.label,
      on: {
        click: () => {
          spec.onInput(option.value)
        },
      },
    })
    return { option, button }
  })
  const group = el(
    'div',
    { class: 'segmented', attrs: { role: 'group', 'aria-labelledby': spec.id } },
    buttons.map((item) => item.button),
  )
  const apply = (value: string) => {
    for (const { option, button } of buttons) {
      const active = option.value === value
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', active ? 'true' : 'false')
    }
  }
  apply(spec.value)
  return {
    el: el('div', { class: 'ctl' }, [
      el('div', { class: 'ctl__head' }, [
        el('span', { class: 'ctl__label', attrs: { id: spec.id }, text: spec.label }),
        el('span', {
          class: 'ctl__meta',
          text: `default ${spec.options.find((option) => option.value === spec.value)?.label ?? ''}`,
        }),
      ]),
      group,
    ]),
    default: spec.value,
    set: apply,
  }
}

export interface SelectSpec {
  id: string
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onInput: (value: string) => void
}

export function selectControl(spec: SelectSpec): Control<string> {
  const select = el(
    'select',
    { class: 'ctl__select', attrs: { id: spec.id } },
    spec.options.map((option) =>
      el('option', { attrs: { value: option.value }, text: option.label }),
    ),
  )
  select.value = spec.value
  select.addEventListener('change', () => spec.onInput(select.value))
  return {
    el: shell({
      id: spec.id,
      label: spec.label,
      control: select,
      defaultText: spec.options.find((option) => option.value === spec.value)?.label ?? spec.value,
      labelIsInput: true,
    }),
    default: spec.value,
    set(value) {
      select.value = value
    },
  }
}
