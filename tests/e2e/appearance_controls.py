#!/usr/bin/env python3
"""Properties controls regression entry point (formerly the two-panel binding test)."""
def change(page, id_, value):
    page.locator('#' + id_).evaluate('''(el,value) => {
      if (el.type === 'checkbox') el.checked=value; else el.value=value;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }''', value)


if __name__ == "__main__":
    from properties_inspector import main
    main()
