import os
import json

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
        # Dismiss onboarding through its real controls before its delayed start
        # can navigate away from an editor later in this workflow.
        page.get_by_role("button", name="How it works", exact=True).click()
        page.locator(".intro-actions .ghost").click()
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

        # Locale controls must cover workflows without changing custom data.
        page.get_by_role("button", name="Text shaping", exact=True).click()
        assert page.get_by_role("heading", name="Shape text into a template").count() == 1, page.locator(".panel").inner_text()
        page.get_by_role("textbox", name="Source text").fill("会社名: 株式会社そのまま\nメール: hello@example.com")
        assert page.get_by_role("button", name="🛡 Scan and mask automatically", exact=True).count() == 1
        assert page.get_by_text("Mask selection:", exact=True).count() == 1
        page.get_by_role("button", name="⚙ Shape locally", exact=True).click()
        page.get_by_role("heading", name="Shaped results (1)", exact=True).wait_for()
        assert page.get_by_role("button", name="Copy as JSON", exact=True).count() == 1
        assert page.get_by_role("button", name="+ Add another", exact=True).count() == 1
        page.get_by_role("button", name="Templates", exact=True).click()
        assert page.get_by_role("heading", name="Template management", exact=True).count() == 1
        assert page.get_by_text("Storage: this browser (localStorage)", exact=True).count() == 1
        page.get_by_role("button", name="+ Create template", exact=True).click()
        assert page.get_by_role("heading", name="Edit template", exact=True).count() == 1
        page.get_by_role("textbox", name="Key (output column)", exact=True).fill("Company")
        assert page.get_by_role("button", name="Save", exact=True).is_enabled()
        page.get_by_role("textbox", name="Template name", exact=True).fill("")
        assert page.get_by_text("Enter a template name", exact=True).count() == 1
        assert page.get_by_role("button", name="Save", exact=True).is_disabled()
        page.locator(".admin-field-summary").click()
        assert page.get_by_role("textbox", name="Key (output column)", exact=True).count() == 1
        assert page.get_by_role("combobox", name="Type", exact=True).count() == 1
        assert page.get_by_role("combobox", name="Input kind", exact=True).count() == 1
        assert page.get_by_role("option", name="String", exact=True).count() == 1
        assert page.get_by_role("option", name="Short text", exact=True).count() == 1
        assert page.get_by_role("textbox", name="Aliases (comma-separated)", exact=True).count() == 1
        assert page.get_by_role("button", name="+ Add auto-fill rule", exact=True).count() == 1
        page.get_by_role("button", name="Cancel", exact=True).click()
        custom = {"id": "literal", "name": "日本語テンプレート", "fields": [
            {"key": "Company", "label": "会社名そのまま", "type": "string", "aliases": ["別名そのまま"], "required": False,
             "inputKind": "select", "options": ["保存値そのまま"], "optionLabels": {"保存値そのまま": "選択肢そのまま"},
             "defaultValue": "既定値そのまま",
             "autoFill": {"expression": 'if(empty({Company}), "固定値そのまま", {Company})', "template": "", "overwrite": False,
                          "cases": [{"sourceFieldKey": "Company", "op": "equals", "value": "比較値そのまま", "template": "結果そのまま {Company}"}]}}
        ]}
        page.locator('input[type="file"]').set_input_files({
            "name": "templates.json", "mimeType": "application/json",
            "buffer": json.dumps([custom], ensure_ascii=False).encode("utf-8"),
        })
        dialog = page.get_by_role("dialog")
        dialog.get_by_role("heading", name="Import templates", exact=True).wait_for()
        assert dialog.get_by_text("日本語テンプレート", exact=True).count() == 1
        assert dialog.get_by_role("button", name="Clear selection", exact=True).count() == 1
        dialog.get_by_role("button", name="Add 1 templates", exact=True).click()
        card = page.locator(".mapping-row").filter(has_text="日本語テンプレート")
        card.get_by_role("button", name="Edit", exact=True).click()
        page.locator(".admin-field-summary").click()
        assert page.get_by_role("textbox", name="Display name", exact=True).input_value() == "会社名そのまま"
        assert page.get_by_role("button", name="Remove 選択肢そのまま", exact=True).count() == 2
        assert page.get_by_role("textbox", name="Label (shown in app)", exact=True).input_value() == "選択肢そのまま"
        assert page.get_by_role("textbox", name="Value (exported and validated)", exact=True).input_value() == "保存値そのまま"
        formula = page.get_by_role("textbox", name="Mini expression", exact=True)
        assert formula.input_value() == custom["fields"][0]["autoFill"]["expression"]
        assert page.get_by_role("textbox", name="Basic template (when not using an expression)", exact=True).count() == 1
        assert page.get_by_role("checkbox", name="Overwrite even when a value exists", exact=True).count() == 1
        assert page.get_by_role("combobox", name="Condition field", exact=True).input_value() == "Company"
        assert page.get_by_role("combobox", name="Condition", exact=True).input_value() == "equals"
        for operator in ("Contains", "Equals", "Starts with", "Ends with", "Is empty", "Is not empty"):
            assert page.get_by_role("option", name=operator, exact=True).count() == 1
        assert page.get_by_role("textbox", name="Comparison value", exact=True).input_value() == "比較値そのまま"
        assert page.get_by_role("textbox", name="Template to insert", exact=True).input_value() == "結果そのまま {Company}"
        assert page.get_by_role("button", name="Delete condition 1", exact=True).count() == 1
        page.get_by_text("Expression help", exact=True).click()
        assert "Field references: {Company}, {Company.value}" in page.locator(".mini-doc pre").inner_text()
        formula.fill("unknown({Company})")
        assert "Unknown function: unknown" in page.locator(".form-error").inner_text()
        formula.fill(custom["fields"][0]["autoFill"]["expression"])
        page.get_by_role("button", name="Save", exact=True).click()
        page.get_by_role("button", name="Export selected templates", exact=True).click()
        dialog.get_by_role("heading", name="Export templates", exact=True).wait_for()
        assert dialog.get_by_text("日本語テンプレート", exact=True).count() == 1
        with page.expect_download() as template_download:
            dialog.get_by_role("button", name="Export 1 templates", exact=True).click()
        with open(template_download.value.path(), encoding="utf-8") as template_file:
            saved = json.load(template_file)[0]
        assert saved["name"] == custom["name"]
        for key in ("label", "aliases", "options", "optionLabels", "defaultValue", "autoFill"):
            assert saved["fields"][0][key] == custom["fields"][0][key], (key, saved["fields"][0][key])
        page.get_by_role("button", name="Settings", exact=True).click()
        page.get_by_role("combobox", name="Language", exact=True).select_option("ja")
        page.get_by_role("button", name="テンプレート管理", exact=True).click()
        card.get_by_role("button", name="編集", exact=True).click()
        page.locator(".admin-field-summary").click()
        assert page.get_by_role("textbox", name="表示名", exact=True).input_value() == "会社名そのまま"
        assert page.get_by_role("combobox", name="型", exact=True).input_value() == "string"
        assert page.get_by_role("option", name="文字列", exact=True).count() == 1
        assert page.get_by_role("textbox", name="ミニ式", exact=True).input_value() == custom["fields"][0]["autoFill"]["expression"]
        page.get_by_role("button", name="キャンセル", exact=True).click()
        page.get_by_role("button", name="設定", exact=True).click()
        page.get_by_role("combobox", name="表示言語", exact=True).select_option("en")
        page.get_by_role("button", name="Formula reference", exact=True).click()
        assert page.get_by_role("heading", name="Auto-fill formula reference", exact=True).count() == 1
        assert page.get_by_text("Safe mini expressions for template auto-fill rules. JavaScript and Python are not executed; only the syntax shown here is evaluated.", exact=True).count() == 1
        assert page.get_by_role("heading", name="Common examples", exact=True).count() == 1
        assert page.get_by_role("heading", name="Syntax reference", exact=True).count() == 1
        first_formula_example = page.locator(".formula-example").first
        assert first_formula_example.get_by_role(
            "heading", name="Fixed text + company name", exact=True
        ).count() == 1
        assert first_formula_example.get_by_text(
            "Outputs, for example, Public web: Sample Corporation.", exact=True
        ).count() == 1
        assert page.get_by_text("if(cond, yes, no)", exact=True).count() == 1
        assert page.get_by_text("{Field}", exact=True).count() == 1
        field_reference = page.locator(".formula-ref-row").filter(
            has=page.get_by_text("{Field}", exact=True)
        )
        assert field_reference.get_by_text(
            "Inserts a field value. Example: {Company}", exact=True
        ).count() == 1
        assert page.get_by_text('"{Company.label}: " & {Company.value}', exact=True).count() == 1

        assert not console_errors, "Browser console errors:\n" + "\n".join(console_errors)

        browser.close()


if __name__ == "__main__":
    main()
