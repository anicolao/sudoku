import { expect, type Page, type TestInfo } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Verification {
  spec: string;
  check: () => Promise<void>;
}

interface DocStep {
  title: string;
  image: string;
  specs: string[];
}

export class TestStepHelper {
  private count = 0;
  private steps: DocStep[] = [];
  private title = '';
  private description = '';

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo
  ) {}

  setMetadata(title: string, description: string): void {
    this.title = title;
    this.description = description;
  }

  async step(
    id: string,
    options: { description: string; verifications: Verification[] }
  ): Promise<void> {
    for (const verification of options.verifications) await verification.check();

    await expect(this.page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(this.page.locator('[data-persistence-status="local"]')).toBeVisible();
    await this.page.mouse.move(0, 0);
    await this.page.evaluate(async () => {
      await document.fonts.ready;
      const root = document.documentElement;
      if (root.scrollWidth > window.innerWidth + 1) {
        throw new Error(`page is ${root.scrollWidth}px wide inside ${window.innerWidth}px`);
      }

      for (const element of document.querySelectorAll<HTMLElement>('[data-e2e-viewport]')) {
        const rect = element.getBoundingClientRect();
        if (rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1) {
          throw new Error(
            `${element.tagName.toLowerCase()} escapes the viewport at ` +
            `${rect.left},${rect.top}–${rect.right},${rect.bottom}`
          );
        }
      }

      for (const element of document.querySelectorAll<HTMLElement>('[data-e2e-no-clip]')) {
        if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
          throw new Error(
            `${element.tagName.toLowerCase()} clips ${element.scrollWidth}×${element.scrollHeight} ` +
            `inside ${element.clientWidth}×${element.clientHeight}`
          );
        }
      }

      for (const control of document.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')) {
        if (!control.checkVisibility()) continue;
        const rect = control.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 44) {
          throw new Error(`${control.tagName.toLowerCase()} target is ${rect.width}×${rect.height}`);
        }
      }
    });

    const index = String(this.count++).padStart(3, '0');
    const filename = `${index}-${id}-${this.testInfo.project.name}-macos.png`;
    await expect(this.page).toHaveScreenshot(filename);
    this.steps.push({
      title: options.description,
      image: `./screenshots/${filename}`,
      specs: options.verifications.map(({ spec }) => spec)
    });
  }

  generateDocs(): void {
    const canonicalProject = this.testInfo.project.name === 'phone' || this.testInfo.project.name === 'offline';
    if (process.env.UPDATE_E2E_DOCS !== '1' || !canonicalProject) return;

    let content = `# ${this.title}\n\n${this.description}\n\n`;
    for (const step of this.steps) {
      content += `## ${step.title}\n\n![${step.title}](${step.image})\n\n`;
      content += `**Verifications:**\n\n${step.specs.map((spec) => `- [x] ${spec}`).join('\n')}\n\n`;
    }
    fs.writeFileSync(
      path.join(path.dirname(this.testInfo.file), 'README.md'),
      `${content.trimEnd()}\n`
    );
  }
}
