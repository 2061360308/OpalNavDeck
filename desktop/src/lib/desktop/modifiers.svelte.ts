class Modifiers {
  alt = $state(false)
  ctrl = $state(false)

  install() {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') this.alt = true
      if (e.key === 'Control' || e.ctrlKey) this.ctrl = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') this.alt = false
      if (e.key === 'Control') this.ctrl = false
      else if (e.ctrlKey === false) this.ctrl = false
    }
    const blur = () => {
      this.alt = false
      this.ctrl = false
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }
}

export const modifiers = new Modifiers()
