<script lang="ts">
	import '@fortawesome/fontawesome-free/css/all.css';
	import Prism from 'prismjs';
	import 'prismjs/plugins/toolbar/prism-toolbar';
	import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard';
	import 'prismjs/components/prism-json';
	import 'prismjs/components/prism-yaml';
	import 'prismjs/components/prism-bash';
	import 'prismjs/components/prism-powershell';
	import 'prismjs/themes/prism-okaidia.css';
	import { onMount } from 'svelte';
	import HeadComponent from '$lib/HeadComponent.svelte';
	import mentions from './mentions.json';

	interface Mention {
		title: string;
		contents: string[];
		links: { text: string; url: string }[];
	}

	interface PrismaRegisterButtonContext {
		element: { parentNode: HTMLElement | null };
	}
	const downloadBaseUrl = 'https://github.com/dont-be-evil-company/timetrack/releases/latest/download/';

	let downloadLink = downloadBaseUrl + 'timetrack-setup-x64.exe';

	let randomOrderMentions: Mention[] = [];

	let installSystem = 'manually';

	const handleAnchorClick = (evt: Event) => {
		evt.preventDefault();
		const link = evt.currentTarget as HTMLAnchorElement;
		const anchorId = new URL(link.href).hash.replace('#', '');
		const anchor = document.getElementById(anchorId);
		window.scrollTo({
			top: anchor?.offsetTop,
			behavior: 'smooth'
		});
		window.history.pushState(null, '', `#${anchorId}`);
	};

	const onInstallSystemChange = (evt: Event) => {
		const select = evt.currentTarget as HTMLSelectElement;
		installSystem = select.value;
		switch (installSystem) {
			case 'linux-appimage':
				downloadLink = downloadBaseUrl + 'timetrack_x86_64.AppImage';
				break;
			case 'linux-deb':
				downloadLink = downloadBaseUrl + 'timetrack_amd64.deb';
				break;
			case 'macos-x64':
				downloadLink = downloadBaseUrl + 'timetrack_x64.dmg';
				break;
			case 'macos-arm64':
				downloadLink = downloadBaseUrl + 'timetrack_arm64.dmg';
				break;
			case 'windows-x64':
				downloadLink = downloadBaseUrl + 'timetrack-setup_x64.exe';
				break;
			default:
				downloadLink = '';
		}
	};

	onMount(() => {
		randomOrderMentions = mentions.sort(() => 0.5 - Math.random());
		Prism.plugins.toolbar.registerButton(
			'fullscreen-code',
			function (ctx: PrismaRegisterButtonContext) {
				const button = document.createElement('button');
				button.innerHTML = '🔍';
				button.addEventListener('click', function () {
					ctx.element.parentNode?.requestFullscreen();
				});

				return button;
			}
		);

		Prism.highlightAll();
	});
</script>

<HeadComponent
	data={{
		title: 'Timetrack',
		description:
			'Simple, offline-first, privacy-focused, cross-platform, desktop application to track your time spent on different projects.'
	}}
/>

<div id="start" class="hero bg-base-200 min-h-screen">
	<div class="hero-content text-center">
		<div class="max-w-md">
			<img src="/logo.svg" alt="Timetrack logo" class="m-5 mx-auto w-64" />
			<h1 class="text-5xl font-bold">Timetrack</h1>
			<p class="py-6">
				A simple, offline-first, privacy-focused, cross-platform, desktop application to track your
				time spent on different projects.
			</p>
			<a href="#screenshots" on:click={handleAnchorClick}
				><button class="btn btn-primary">Screenshots</button></a
			>
		</div>
	</div>
</div>
<div id="screenshots" class="hero bg-base-200 min-h-screen">
	<div class="hero-content text-center">
		<div class="max-w-2xl">
			<a href="#screenshots" on:click={handleAnchorClick}>
				<h1 class="text-5xl font-bold">Screenshots 📸</h1>
			</a>
			<a href="/assets/screenshots/overview.webp">
				<img
					src="/assets/screenshots/overview.webp"
					alt="Screenshot of the overview"
					class="m-5 mx-auto"
				/>
			</a>
			<p class="py-6">
				This animated screenshot shows the overview page of Timetrack, where you can see all your
				companies, projects and tasks.
			</p>
			<a href="#install" on:click={handleAnchorClick}
				><button class="btn btn-primary">Install</button></a
			>
		</div>
	</div>
</div>
<div id="install" class="hero bg-base-200 min-h-screen">
	<div class="hero-content text-center">
		<div class="max-w-md">
			<a href="#install" on:click={handleAnchorClick}>
				<h1 class="text-5xl font-bold">Install ⚡</h1>
			</a>
			<p class="py-6">Install Timetrack ...</p>
			<select on:input={onInstallSystemChange} class="select select-bordered mb-5">
				<option value="manually">select manually</option>
				<option value="aur">Arch Linux x64</option>
				<option value="linux-appimage">Linux x86_64 .AppImage</option>
				<option value="linux-deb">Linux .deb</option>
				<option value="macos-x64">MacOS x64</option>
				<option value="macos-arm64">MacOS arm64</option>
				<option value="windows-x64">Windows x64</option>
			</select>
			<div class={installSystem === 'manually' ? '' : 'hidden'}>
				<p class="mb-5">
					Download the latest release from the <a class="text-secondary" href="/download"
						>releases page</a
					>.
				</p>
			</div>
			<div class={installSystem === 'aur' ? '' : 'hidden'}>
				<p class="mb-5">
					Via AUR, using an AUR helper like <a
						href="https://github.com/Jguer/yay"
						class="text-secondary">yay</a
					>
				</p>
				<pre><code
						class="language-bash"
						data-toolbar-order="copy-to-clipboard"
						data-prismjs-copy="📋">yay -S dbe-timetrack-bin</code
					></pre>
				<p class="mb-5">
					.. or via <a href="https://github.com/morganamilo/paru" class="text-secondary">paru</a>
				</p>
				<pre><code
						class="language-bash"
						data-toolbar-order="copy-to-clipboard"
						data-prismjs-copy="📋">paru -S dbe-timetrack-bin</code
					></pre>
				<div class="alert alert-info mt-5">
					<p>
						<i class="fas fa-info-circle"></i>
						There is already a package called
						<code class="rounded-xl bg-gray-900 p-1 text-nowrap text-white">timetrack</code>
						in AUR, to avoid confusion, the package for this project is called
						<code class="rounded-xl bg-gray-900 p-1 text-nowrap text-white">dbe-timetrack-bin</code>.
					</p>
				</div>
			</div>
			<div class={installSystem !== 'manually' && installSystem !== 'aur' ? '' : 'hidden'}>
				<p class="mb-5">
					<a href={downloadLink} target="_blank" rel="noopener noreferrer">
						<button class="btn btn-secondary mt-5">Download {installSystem}</button></a
					>
				</p>
			</div>
			<p>
				<a href="#honorable-mentions" on:click={handleAnchorClick}
					><button class="btn btn-primary mt-5">Honorable mentions</button></a
				>
			</p>
		</div>
	</div>
</div>
<div id="honorable-mentions" class="hero bg-base-200 min-h-screen">
	<div class="hero-content text-center">
		<div class="max-w-md">
			<a href="#honorable-mentions" on:click={handleAnchorClick}>
				<h1 class="text-5xl font-bold">Honorable mentions 🥰</h1>
			</a>
			<p class="py-6">These projects helped make Timetrack possible:</p>
			{#each randomOrderMentions as mention, idx}
				{#if idx > 0}
					<div class="my-4"></div>
				{/if}
				<div class="card bg-base-100 mx-auto w-96 shadow-sm">
					<div class="card-body">
						<h2 class="card-title">
							{mention.title}
						</h2>
						{#each mention.contents as content}
							<p>{content}</p>
						{/each}
						<div class="card-actions justify-end">
							{#each mention.links as link}
								<a class="badge badge-outline" href={link.url}>{link.text}</a>
							{/each}
						</div>
					</div>
				</div>
			{/each}
			<p>
				<a href="#get-involved" on:click={handleAnchorClick}
					><button class="btn btn-primary mt-5">Get involved</button></a
				>
			</p>
		</div>
	</div>
</div>
<div id="get-involved" class="hero bg-base-200 min-h-screen">
	<div class="hero-content text-center">
		<div class="max-w-md">
			<a href="#get-involved" on:click={handleAnchorClick}>
				<h1 class="text-5xl font-bold">Get involved 📦</h1>
			</a>
			<p class="py-6">Timetrack is open-source and we welcome contributions.</p>
			<p>
				View the <a class="text-secondary" href="https://github.com/dont-be-evil-company/timetrack">code</a
				>, and/or check out the
				<a class="text-secondary" href="/docs">docs</a>.
			</p>
			<p class="py-6">
				If you're interested in how it all started, you can read a bit about that
				<a
					class="text-secondary"
					href="https://gorilla.moe/blog/how-i-came-to-build-timetrack-an-offline-first-desktop-time-tracking-app"
					>here</a
				>.
			</p>
		</div>
	</div>
</div>
