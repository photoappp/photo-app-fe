/* 2026.11.27 Android에서 스마트폰 시스템 글꼴 크기가 앱에 영향을 주지 않도록 fontScale을 1.0으로 고정.
   JS Text는 allowFontScaling={false}(components/FixedText.tsx)로 처리했지만, 네이티브 뷰(react-native-date-picker의
   날짜 휠 등)는 시스템 글꼴 크기를 그대로 따라 커졌음. 라이브러리 코드를 고치지 않고 앱 단에서 고정.
   - MainActivity: 화면(Activity) 리소스
   - MainApplication: React Native가 네이티브 뷰를 만들 때 쓰는 컨텍스트가 Application 기반이라 여기도 필요
   expo prebuild 시 두 파일에 attachBaseContext 재정의를 추가(이미 있으면 건너뜀) by yen */
const { withMainActivity, withMainApplication } = require('expo/config-plugins');

const MARKER = 'withFixedFontScale';

const IMPORTS = ['import android.content.Context', 'import android.content.res.Configuration'];

const OVERRIDE = `
  // ${MARKER}: 시스템 글꼴 크기 무시(fontScale 1.0 고정)
  override fun attachBaseContext(newBase: Context) {
    val config = Configuration(newBase.resources.configuration)
    config.fontScale = 1.0f
    super.attachBaseContext(newBase.createConfigurationContext(config))
  }
`;

const addOverride = (contents, classPattern, fileLabel) => {
  if (contents.includes(MARKER)) return contents;
  let src = contents;
  const missing = IMPORTS.filter(line => !src.includes(line));
  if (missing.length > 0) {
    src = src.replace(/^(package [^\n]+\n)/m, `$1\n${missing.join('\n')}\n`);
  }
  src = src.replace(classPattern, match => `${match}${OVERRIDE}`);
  if (!src.includes(MARKER)) {
    throw new Error(`withFixedFontScale: class declaration not found in ${fileLabel}`);
  }
  return src;
};

const assertKotlin = (mod, fileLabel) => {
  if (mod.modResults.language !== 'kt') {
    throw new Error(`withFixedFontScale: only Kotlin ${fileLabel} is supported`);
  }
};

module.exports = function withFixedFontScale(config) {
  config = withMainActivity(config, mod => {
    assertKotlin(mod, 'MainActivity');
    mod.modResults.contents = addOverride(
      mod.modResults.contents,
      /class MainActivity\s*:\s*ReactActivity\(\)\s*\{/,
      'MainActivity',
    );
    return mod;
  });
  return withMainApplication(config, mod => {
    assertKotlin(mod, 'MainApplication');
    mod.modResults.contents = addOverride(
      mod.modResults.contents,
      /class MainApplication\s*:\s*Application\(\)\s*,\s*ReactApplication\s*\{/,
      'MainApplication',
    );
    return mod;
  });
};
