# driveRecover

I have done this Node app to be able to help with ransomware disasters on Google Drive.
Ransomware are those virus that encrypts your files and then ask for some payment to get them recovered, they are also know as cryptolockers 
as it was one of the first virus with that approach.

Depending on the virus it may be posible to decrypt your files but in case there is no such recovery tool, then at least this can help you
recover the files stored on Google Drive as it keeps all revisions of your files for some time. 

There is no setting or option to recover the files encrypted except for going one by one recovering the previous revision of the file.
People using Google Apps can use the admin console to recover to a certain point in time, but there is no option for free users.

That's why I made this little app that does all the work for you going after every encrypted file and recovering the previous revision 
(the one before the encryption).

**Disclaimer**
Using this app will delete information from your Google Drive (and shared folders) without human intervention, I have tested and used it 
to recover my data but by no means I am responsible for any unintentional data loss. Drive api can change, ransomware can change, so use this 
as your last option or at least test it and try it before using it at large scale.

## Installing driveRecover

* Clone this repo
* `npm install`
* Get API credentials, move the file to your working directory and rename it client_secret.json.


## Get your a Google Api Credentials

To run the application you need to create an Api client on Google Developers, this is done only one time and it is really easy

 * Get your own Google api credentials using this [wizard](https://console.developers.google.com/start/api?id=drive)
 * Select the application type Other, enter a name for your App, and click the Create button.
 * Click OK to dismiss the resulting dialog.
 * Click the file_download (Download JSON) button to the right of the client ID.


## Using driveRecover

The first time you use the app it will ask for authorization, you will need to open a provided url in your browser and then authorize the app you 
created when doing the installation and paste back the provided code from the browser to the app.
The app ask for full control you your files, this is needed to manage revisions, delete files and rename them.

This app has 2 commands:
```
Usage: app [command]


Commands:

  fix [extension]       Try to fix all the files with the provided extension 
  deleteAll [fileName]  delete all files with the given name
```

### fix command ###

Fix command is the main one, it will search your whole drive (including folders and files shared with you) for files with the provided extension,
then in you have edit rights, the file is not a folder and it is not trashed it will try to recover it.
The recover process will be get the list of revisions of the file, sort them by date and then:

 * If there are 2 or more revisions and the newest one file name contains the extension, it will delete the last revision and then rename the file with the
  name of the previous revision, this is the same as reverting the last update of the file.
 * If there is only one revision, then check if the name of the revision doesn't match the extension if so rename with the revision filename. (See Known issues)

This should be the same as reverting the last update of every file that has the extension, different ransomware have different extensions that's why you must provide 
it when running the app.

### deleteAll command ###

This command is more a utility command, it is usefull for deleting all the txt files that ransomware usually includes with recover instructions on every folder.
You could do the same using the web, searching and deleting all of them, but sometimes it is unresponsive with too many files.
Of course this can be used for whatever other use you can think of, provide a file name and this will delete all copies of it in your drive (shareds included).

This does not delete revisions, it does delete the whole file.

## Known issues

Google Drive has an Api limit of 10 request per second, this app uses a limiter to try to avoid reaching the limit (it makes 6 request per second) but sometimes due to 
how the app and Google measures the request per second you can hit the limit, in that case the request will fail, in most cases that is not a problem except when we are 
in the process of fixing a file, in that case, if we remove the last revision but the rename fails, the file contents will be ok but the file name will remain wrong.
If you get any problem you can run the fix command again, on most cases it will just fix the files that returned an error, and even in the case that was the rename what 
failed it will recover it (in some cases it will undo more than 1 revision and thus lose some actual changes).