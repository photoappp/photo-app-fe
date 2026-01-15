import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';

export default function AppText({ style, children, ...props }: TextProps) {
	return (
		<Text style={[styles.text, style]} {...props}>
			{children}
		</Text>
	);
}

const styles = StyleSheet.create({
	text: {
		fontSize: 16,
		color: '#111', // 다크모드 대응 시 조건부 스타일 추가 가능
	},
});
