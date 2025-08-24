from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    # Desktop view
    page.set_viewport_size({"width": 1280, "height": 720})
    page.goto("http://localhost:5173/")
    page.get_by_role("button", name="English").click()
    page.get_by_role("button", name="Start New Story").click()
    page.get_by_placeholder("e.g., The Quest for the Lost Amulet").fill("Test Story")
    page.get_by_role("button", name="Begin").click()

    # Wait for the retry button to appear
    retry_button = page.locator("#retry-btn")
    retry_button.wait_for(timeout=60000)

    page.screenshot(path="jules-scratch/verification/retry_button_fix.png")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
