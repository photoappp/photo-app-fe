import ParallaxScrollView from '@/components/ParallaxScrollView'
import * as MediaLibrary from 'expo-media-library'
import { useEffect, useState } from 'react'
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native'

export default function HomeScreen() {
	const [images, setImages] = useState<any[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const loadImages = async () => {
			try {
				console.log('Requesting permissions...')
				const { status } = await MediaLibrary.requestPermissionsAsync()

				if (status !== 'granted') {
					setError('Permission denied to access media library')
					Alert.alert(
						'Permission Required',
						'Please grant permission to access photos'
					)
					setLoading(false)
					return
				}

				console.log('Permission granted, fetching assets...')

				// Get first 10 photos
				const assets = await MediaLibrary.getAssetsAsync({
					first: 10,
					mediaType: 'photo',
					sortBy: 'creationTime',
				})

				console.log(`Found ${assets.assets.length} assets`)

				if (assets.assets.length === 0) {
					setError('No images found in media library')
					setLoading(false)
					return
				}

				// Get detailed info for each asset
				const assetInfos = await Promise.all(
					assets.assets.map(async (asset) => {
						try {
							const info = await MediaLibrary.getAssetInfoAsync(asset.id)
							console.log('Asset info:', info)
							return info
						} catch (err) {
							console.error('Error getting asset info:', err)
							return asset // fallback to basic asset info
						}
					})
				)

				setImages(assetInfos)
			} catch (err) {
				console.error('Error loading images:', err)
			} finally {
				setLoading(false)
			}
		}

		loadImages()
	}, [])

	if (loading) {
		return (
			<ParallaxScrollView
				headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
				headerImage={
					<Image
						source={require('@/assets/images/partial-react-logo.png')}
						style={styles.reactLogo}
					/>
				}
			>
				<View style={styles.centerContainer}>
					<Text>Loading images...</Text>
				</View>
			</ParallaxScrollView>
		)
	}

	if (error) {
		return (
			<ParallaxScrollView
				headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
				headerImage={
					<Image
						source={require('@/assets/images/partial-react-logo.png')}
						style={styles.reactLogo}
					/>
				}
			>
				<View style={styles.centerContainer}>
					<Text style={styles.errorText}>{error}</Text>
				</View>
			</ParallaxScrollView>
		)
	}

	return (
		<ParallaxScrollView
			headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
			headerImage={
				<Image
					source={require('@/assets/images/partial-react-logo.png')}
					style={styles.reactLogo}
				/>
			}
		>
			<View style={styles.container}>
				<Text style={styles.title}>Found {images.length} images</Text>

				{images.map((img, index) => (
					<View
						key={img.id || index}
						style={styles.imageContainer}
					>
						<Image
							source={{ uri: img.uri }}
							style={styles.image}
							onError={(error) => {
								console.error('Image load error:', error)
							}}
							onLoad={() => {
								console.log('Image loaded successfully:', img.uri)
							}}
						/>
						<ScrollView
							style={styles.metadataContainer}
							horizontal
						>
							<Text style={styles.metadata}>
								{JSON.stringify(
									{
										id: img.id,
										filename: img.filename,
										uri: img.uri,
										mediaType: img.mediaType,
										width: img.width,
										height: img.height,
										creationTime: img.creationTime,
										modificationTime: img.modificationTime,
									},
									null,
									2
								)}
							</Text>
						</ScrollView>
					</View>
				))}
			</View>
		</ParallaxScrollView>
	)
}

const styles = StyleSheet.create({
	container: {
		padding: 16,
	},
	centerContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	title: {
		fontSize: 18,
		fontWeight: 'bold',
		marginBottom: 16,
		textAlign: 'center',
	},
	imageContainer: {
		marginBottom: 20,
		alignItems: 'center',
		backgroundColor: '#f5f5f5',
		borderRadius: 8,
		padding: 10,
	},
	image: {
		width: 300,
		height: 300,
		borderRadius: 8,
		backgroundColor: '#ddd',
	},
	metadataContainer: {
		maxHeight: 200,
		marginTop: 10,
		backgroundColor: '#fff',
		borderRadius: 4,
		padding: 8,
		width: '100%',
	},
	metadata: {
		fontFamily: 'monospace',
		fontSize: 12,
		color: '#333',
	},
	errorText: {
		color: 'red',
		textAlign: 'center',
		fontSize: 16,
	},
	titleContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	stepContainer: {
		gap: 8,
		marginBottom: 8,
	},
	reactLogo: {
		height: 178,
		width: 290,
		bottom: 0,
		left: 0,
		position: 'absolute',
	},
})
