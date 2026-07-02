import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import ChipEditor from './ChipEditor.vue'

describe('ChipEditor', () => {
  it('renders initial tags', () => {
    const wrapper = mount(ChipEditor, {
      props: { modelValue: ['React', 'Vue'] },
    })
    const chips = wrapper.findAll('.chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].text()).toContain('React')
    expect(chips[1].text()).toContain('Vue')
  })

  it('emits update on Enter with the new tag appended', async () => {
    const wrapper = mount(ChipEditor, {
      props: { modelValue: ['React'] },
    })
    const input = wrapper.get('input')
    await input.setValue('Vue')
    await input.trigger('keydown.enter')

    const events = wrapper.emitted('update:modelValue')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual(['React', 'Vue'])
  })

  it('does not emit when input is blank or whitespace', async () => {
    const wrapper = mount(ChipEditor, {
      props: { modelValue: ['React'] },
    })
    const input = wrapper.get('input')
    await input.setValue('   ')
    await input.trigger('keydown.enter')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('does not emit when tag already exists, and clears draft', async () => {
    const wrapper = mount(ChipEditor, {
      props: { modelValue: ['React'] },
    })
    const input = wrapper.get('input')
    await input.setValue('React')
    await input.trigger('keydown.enter')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('emits update with the tag removed on × click', async () => {
    const wrapper = mount(ChipEditor, {
      props: { modelValue: ['React', 'Vue'] },
    })
    await wrapper.findAll('.chip-x')[0].trigger('click')
    const events = wrapper.emitted('update:modelValue')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual(['Vue'])
  })

  it('works as v-model — parent state updates round-trip', async () => {
    const Host = defineComponent({
      setup() {
        const tags = ref<string[]>(['A'])
        return { tags }
      },
      render() {
        return h(ChipEditor, {
          modelValue: this.tags,
          'onUpdate:modelValue': (v: string[]) => {
            this.tags = v
          },
        })
      },
    })

    const wrapper = mount(Host)
    const input = wrapper.get('input')
    await input.setValue('B')
    await input.trigger('keydown.enter')
    expect((wrapper.vm as unknown as { tags: string[] }).tags).toEqual(['A', 'B'])

    await wrapper.findAll('.chip-x')[0].trigger('click')
    expect((wrapper.vm as unknown as { tags: string[] }).tags).toEqual(['B'])
  })

  it('renders label and placeholder when provided', () => {
    const wrapper = mount(ChipEditor, {
      props: { modelValue: [], label: 'Core stack', placeholder: 'React…' },
    })
    expect(wrapper.get('.field-label').text()).toBe('Core stack')
    expect((wrapper.get('input').element as HTMLInputElement).placeholder).toBe('React…')
  })

  it('applies the variant class', () => {
    const wrapper = mount(ChipEditor, {
      props: { modelValue: ['X'], variant: 'negative' },
    })
    expect(wrapper.get('.chip-group').classes()).toContain('variant-negative')
  })
})
