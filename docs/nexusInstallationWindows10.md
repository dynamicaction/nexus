# Nexus Local Installation #

----------
There are many ways to get this installed and running locally. We can document those ways here.

## Windows 10 (via WSL Ubuntu) ##

In Windows 10 there is an option called Windows Subsystem for Linux (WSL). It allows you to install Linux on top of Windows. We use this to run our standalone nexus instance. We are able to install NodeJS and other NPM modules quickly an easily while also doing most of the work in Windows.

1. Enable WSL through PowerShell

	1. Click 'Start' and type 'Powershell'
	2. Right-click on 'Powershell' and click 'Run as Administrator'
	3. Run the following command

			Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux

	4. You may be asked to restart your computer. If so, do so.

2. Install Ubuntu WSL through the Microsoft Store

	1. Click 'Start' and type 'Microsoft Store'
	2. Search for 'Ubuntu'
	3. Open the 'Ubuntu' app and click 'Install'

3. Install WSLTTY which is just a terminal for WSL that we'll be using.

	1. Download https://github.com/mintty/wsltty/releases/download/1.9.3/wsltty-1.9.3-install.exe
	2. Install the package
 
4. Install Git for Windows if you don't already have it. If you do make sure that you have at least version 2

	1. Download https://github.com/git-for-windows/git/releases/download/v2.19.1.windows.1/Git-2.19.1-64-bit.exe
	2. Install the package (all the standard options should be fine)
 
5. Install 'Visual Studio Code'

	1. Download https://code.visualstudio.com/Download
	2. Install the package
		
6. Step #3 should have placed a penguin logo on your desktop named 'WSL Terminal'

	1. Open It
	2. Issue `sudo su -` to become root
	3. Install NodeJS
	 
			curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
			sudo apt-get install -y nodejs

	4. Create a directory on your hard drive where you want to keep your workspace
	5. Create a symbolic link to this directory by issuing the command

			ln -s /mnt/c/<path>/<on>/<windows> /opt/nexus

	6. Download the source code
			
			cd /opt/nexus
			git clone https://github.com/dynamicaction/nexus.git .

	7. Download all required npm modules

			npm update

	8. Open Visual Studio Code

	9. Open the project workspace

		1. Click 'Add Workspace Folder'
		2. Choose the folder on your C drive where git placed the files
		3. Click 'Open'

	10. Start the server by navigating to the debug view. This is the icon on the far left that is a bug crossed out) and clicking the green 'play icon'. You should see the following:

			C:\WINDOWS\System32\bash.exe -ic 'node --inspect-brk=10721 src/nexus.js' 
			Debugger listening on ws://127.0.0.1:10721/d4302a7f-017c-426c-b5ad-fe8161d01087
			Debugger attached.
			Example app listening on port 3000!		
	
	11. Navigate in your browser to http://localhost:3000/nexus