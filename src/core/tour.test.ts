import { describe, expect, test } from 'vitest';
import { tourStepsFor } from './tour';

describe('tourStepsFor', () => {
  test('returns a fully English tour including action prompts', () => {
    const source = tourStepsFor('en', 'app', 'source')[0];
    const target = tourStepsFor('en', 'app', 'target')[0];
    const formula = tourStepsFor('en', 'formula', undefined)[0];

    expect(source).toMatchObject({
      title: 'Welcome',
      primaryLabel: 'Try a sample →',
    });
    expect(target).toMatchObject({
      title: '2. Choose a destination',
      waitHint: 'Click a destination below (for example, Salesforce — Lead).',
    });
    expect(formula).toMatchObject({
      title: 'Formula reference',
      primaryLabel: 'Finish tour',
    });
  });

  test('returns the Japanese tour without changing its step sequence', () => {
    const source = tourStepsFor('ja', 'app', 'source')[0];
    const target = tourStepsFor('ja', 'app', 'target')[0];
    const formula = tourStepsFor('ja', 'formula', undefined)[0];

    expect(source).toMatchObject({
      id: 'source-upload',
      title: 'ようこそ',
      primaryLabel: 'サンプルで試す →',
    });
    expect(target).toMatchObject({
      id: 'target-panel',
      title: '2. インポート先を選ぶ',
      waitHint:
        'この中からインポート先を1つクリックしてください（例: Salesforce — リード）',
    });
    expect(formula).toMatchObject({
      id: 'formula-panel',
      title: '式リファレンス',
      primaryLabel: 'ツアーを終える',
      final: true,
    });
  });
});
