/* 2026.11.27 스마트폰 시스템 글꼴 크기 변경이 앱 화면에 영향을 주지 않도록 allowFontScaling={false}를 기본 적용한
   Text/TextInput — 큰 글꼴 설정에서 화면이 깨지던 문제. React 19에서는 Text.defaultProps로 전역 지정이 불가해
   공용 컴포넌트로 감싸고 각 화면은 react-native 대신 여기서 Text/TextInput을 import.
   호출부에서 allowFontScaling을 직접 지정하면 그 값을 따름(undefined는 false로 처리) by yen */
import type { ComponentPropsWithRef } from "react";
import { Text as RNText, TextInput as RNTextInput } from "react-native";

export function Text(props: ComponentPropsWithRef<typeof RNText>) {
  return <RNText {...props} allowFontScaling={props.allowFontScaling ?? false} />;
}

export function TextInput(props: ComponentPropsWithRef<typeof RNTextInput>) {
  return (
    <RNTextInput {...props} allowFontScaling={props.allowFontScaling ?? false} />
  );
}
