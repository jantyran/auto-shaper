import os

from playwright.sync_api import sync_playwright


def main() -> None:
    console_errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )

        page.goto(os.getenv("I18N_UI_URL", "http://127.0.0.1:5502"))
        page.wait_for_load_state("networkidle")
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_load_state("networkidle")

        english = page.get_by_role("button", name="English")
        japanese = page.get_by_role("button", name="日本語")
        app_content = page.locator(".app")

        assert app_content.get_attribute("aria-hidden") == "true", app_content.evaluate(
            "element => element.outerHTML"
        )
        assert app_content.get_attribute("inert") is not None
        assert app_content.evaluate(
            "element => getComputedStyle(element).pointerEvents"
        ) == "none"

        english.press("Shift+Tab")
        assert japanese.evaluate("element => element === document.activeElement")

        japanese.press("Tab")
        assert english.evaluate("element => element === document.activeElement")

        english.click()
        assert page.locator("html").get_attribute("lang") == "en"
        assert page.title() == "Auto Shaper — Data shaping"
        assert (
            page.get_by_role("heading", name="1. Upload source data").count() == 1
        )
        assert not console_errors, "Browser console errors:\n" + "\n".join(console_errors)

        browser.close()


if __name__ == "__main__":
    main()
