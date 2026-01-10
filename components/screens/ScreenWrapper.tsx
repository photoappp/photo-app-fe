//  ScreenWrapper.tsx
import React, { ReactNode } from 'react';
import { View, StyleSheet, Image, Text, TouchableOpacity, Linking } from 'react-native';
import { useTheme } from '@/components/context/ThemeContext';

const ScreenWrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
	const { isDarkTheme } = useTheme();
	
	const themeStyles = isDarkTheme ? dark : light;

	return (
			<View style={[styles.container, themeStyles.container]}>
			<View style={styles.content}>{children}</View>

			<View style={[styles.footer, themeStyles.footer]}>
				<Image
					source={require('../../assets/SIL_logo_setting_mini_xxhdpi.png')}
					style={styles.logo}
					resizeMode="contain"
				/>
				<View style={styles.links}>
					<TouchableOpacity onPress={() => Linking.openURL('https://marmalade-neptune-dbe.notion.site/Terms-Conditions-c18656ce6c6045e590f652bf8291f28b?pvs=74')}>
						<Text style={[styles.linkText, themeStyles.text]}>Terms of Use</Text>
					</TouchableOpacity>
					<Text style={[styles.separator, themeStyles.text]}>|</Text>
					<TouchableOpacity onPress={() => Linking.openURL('https://marmalade-neptune-dbe.notion.site/Privacy-Policy-ced8ead72ced4d8791ca4a71a289dd6b')}>
						<Text style={[styles.linkText, themeStyles.text]}>Privacy Policy</Text>
					</TouchableOpacity>
				</View>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: {flex: 1 },
	footer: {
		padding: 20,
		borderTopWidth: 1,
		borderColor: '#ccc',
		alignItems: 'center',
		backgroundColor: '#d6d6d6',
	},
	logo: { width: 120, height: 24, marginBottom: 5 },
	links: { flexDirection: 'row', alignItems: 'center' },
	linkText: { marginHorizontal: 5 },
	separator: { marginHorizontal: 5 },
});

const light = StyleSheet.create({
	container: { backgroundColor: '#fff' },
	footer: {},
	text: { color: '#555' },
});

const dark = StyleSheet.create({
	container: { backgroundColor: '#121212' },
	footer: {},
	text: { color: '#555' },
});

export default ScreenWrapper;

