import yt_dlp

class MyLogger:
    def debug(self, msg):
        # For compatibility with youtube-dl, both debug and info are passed into debug
        # You can distinguish them by the prefix '[debug] '
        if msg.startswith('[debug] '):
            print(msg)
            pass
        else:
            self.info(msg)

    def info(self, msg):
        print(msg)
        pass

    def warning(self, msg):
        print(msg)
        pass

    def error(self, msg):
        print(msg)


# ℹ️ See "progress_hooks" in help(yt_dlp.YoutubeDL)
def my_hook(d):
    if d['status'] == 'finished':
        print('Done downloading, now post-processing ...')

ydl_opts = {
        'output': "%(title)s-%(id)s.%(ext)s",
        'restrictfilenames': True,
        'logger': MyLogger(),
        'progress_hooks': [my_hook],
}



URLS = ['https://www.youtube.com/watch?v=apREl0KmTdQ']
print("Starting download")
with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download(URLS)



