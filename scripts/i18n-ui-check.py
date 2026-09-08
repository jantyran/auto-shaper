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
        page.locator('input[type="file"]').set_input_files({
            "name": "source.csv",
            "mimeType": "text/csv",
            "buffer": "会社名,メール\n株式会社そのまま,hello@example.com\n".encode("utf-8"),
        })
        page.wait_for_selector(".read-options")
        assert page.get_by_text("Read settings", exact=True).count() == 1, (
            "English upload controls are missing; actual copy: "
            + page.locator(".read-options").first.inner_text()
        )
        assert page.get_by_role("heading", name="2. Select destination format").count() == 1
        page.get_by_role("button", name="+ Add files", exact=True).click()
        assert page.get_by_text("Drop more files with the same shape", exact=True).count() == 1
        page.get_by_role("button", name="Close", exact=True).click()
        page.get_by_role("button", name="Choose header row again").click()
        assert page.get_by_title("Use row 1 as headers").count() == 1
        page.get_by_role("button", name="Close", exact=True).click()
        page.get_by_role("button", name="+ Add lookup table", exact=True).click()
        lookup_drop = page.locator(".dropzone").filter(has_text="Drop a lookup file")
        lookup_drop.locator('input[type="file"]').set_input_files({
            "name": "lookup.csv",
            "mimeType": "text/csv",
            "buffer": "会社名,地域\n株式会社そのまま,東京都\n".encode("utf-8"),
        })
        page.get_by_role("combobox", name="Source column", exact=True).select_option("会社名")
        page.get_by_role("combobox", name="Lookup column", exact=True).select_option("会社名")
        page.get_by_text("1 of 1 rows matched (0 unmatched)", exact=True).wait_for()
        page.get_by_role("button", name="Remove lookup.csv from lookup tables").click()
        page.locator('input[type="file"]').set_input_files({
            "name": "destination.csv",
            "mimeType": "text/csv",
            "buffer": "会社名,メール\n".encode("utf-8"),
        })
        page.wait_for_selector(".mapping-row")
        assert page.get_by_role("heading", name="3. Review and edit mapping").count() == 1
        assert page.get_by_role("combobox", name="Transform method").count() == 2
        assert page.get_by_role("button", name="Trim whitespace", exact=True).count() == 2
        assert page.get_by_text("株式会社そのまま", exact=True).count() > 0
        page.get_by_role("button", name="Filter rows", exact=True).click()
        page.get_by_role("textbox", name="Comparison value").fill("missing company")
        assert page.get_by_text("1 of 1 rows included (0 rows excluded)", exact=True).count() == 1
        assert page.get_by_role("button", name="Delete condition 1").count() == 1
        page.get_by_role("button", name="Remove row filter", exact=True).click()
        first_mapping = page.locator(".mapping-row").first
        first_mapping.get_by_role("button", name="Create a value map").click()
        first_mapping.get_by_role("button", name="Fill from source values").click()
        assert first_mapping.get_by_placeholder("Source value").input_value() == "株式会社そのまま"
        assert first_mapping.get_by_role("button", name="Delete row 1").count() == 1
        first_mapping.get_by_role("button", name="Remove value map").click()
        page.get_by_role("button", name="Settings", exact=True).click()
        page.get_by_role("combobox", name="Language", exact=True).select_option("ja")
        page.get_by_role("button", name="表の整形", exact=True).click()
        assert page.get_by_role("heading", name="3. マッピングを確認・修正").count() == 1
        assert page.get_by_role("button", name="前後空白除去", exact=True).count() == 2
        assert page.get_by_text("株式会社そのまま", exact=True).count() > 0
        page.get_by_role("button", name="設定", exact=True).click()
        page.get_by_role("combobox", name="表示言語", exact=True).select_option("en")
        page.get_by_role("button", name="Data shaping", exact=True).click()
        page.get_by_role("button", name="Convert with these settings →").click()
        page.get_by_role("button", name="Download shaped CSV", exact=True).wait_for()
        assert page.get_by_role("heading", name="4. Convert and export").count() == 1
        assert page.get_by_role("button", name="Download Excel (.xlsx)", exact=True).count() == 1
        assert page.get_by_role("radio", name="Report only (export all rows)").count() == 1
        page.get_by_role("radio", name="Merge into one row").check()
        assert page.get_by_role("option", name="First non-empty value", exact=True).count() == 1
        assert "Validation passed" in page.locator(".alert.ok").first.inner_text()
        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Download shaped CSV", exact=True).click()
        assert downloaded.value.suggested_filename == "source_shaped.csv"
        with open(downloaded.value.path(), encoding="utf-8-sig") as csv:
            exported = csv.read()
        assert "会社名" in exported and "株式会社そのまま" in exported
        assert not console_errors, "Browser console errors:\n" + "\n".join(console_errors)

        browser.close()


if __name__ == "__main__":
    main()
