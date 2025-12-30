// react-native.config.js
module.exports = {
  dependencies: {
    'react-native-date-picker': {
      platforms: {
        ios: null,   // iOS에서만 발생하는 오류때문에 이 라이브러리 네이티브 모듈 등록 안함
      },
    },
  },
};