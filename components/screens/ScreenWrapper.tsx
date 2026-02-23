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
						<Text style={[styles.linkText, themeStyles.text]}>Terms</Text>
					</TouchableOpacity>
					<Text style={[styles.separator, themeStyles.text]}>|</Text>
					<TouchableOpacity onPress={() => Linking.openURL('https://marmalade-neptune-dbe.notion.site/Privacy-Policy-ced8ead72ced4d8791ca4a71a289dd6b')}>
						<Text style={[styles.linkText, themeStyles.text]}>Privacy</Text>
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
		flexDirection: 'row',
		justifyContent: 'space-evenly',
		flexWrap: 'nowrap',
		padding: 15,
		borderTopWidth: 1,
		borderColor: '#ccc',
		alignItems: 'center',
		backgroundColor: '#2c2c2e',
	},
	logo: { width: 120, height: 24, marginBottom: 5 },
	links: { flexDirection: 'row', alignItems: 'center' },
	linkText: { marginHorizontal: 2 },
	separator: { marginHorizontal: 2 },
});

const light = StyleSheet.create({
	container: { backgroundColor: '#fff' },
	footer: {},
	text: { color: '#999' },
});

const dark = StyleSheet.create({
	container: { backgroundColor: '#121212' },
	footer: {},
	text: { color: '#999' },
});

export default ScreenWrapper;

