; Чёрный Ворон 1 - игра, одна сборка sjasmplus. Страницы 128K: 5 (#4000), 2 (#8000), 0, 1, 3, 4, 6, 7 (#C000).
; Сборка: build.py. Нужны build/disk_layout.inc (раскладка файлов диска) и build/data/ (упакованные ресурсы).
; -DONE_DISK=1 - вариант для образа 1 МБ (один диск, без запросов на смену диска).
	DEVICE ZXSPECTRUM128
	INCLUDE "w.asm"
; Вектор прерываний IM2 (таблица IM2_TAB и JP INTRP на IM2_JP в странице 2) создаёт стартовая подпрограмма #FE00 (wmisc_6.asm):
; на диске хранится только первые 4 КБ страницы 2 (карта).
	MMU 3,0
	SAVEBIN "page0.bin",#C000,#4000
	SAVEBIN "page5.bin",#4000,#4000
	SAVEBIN "page2.bin",#8000,#4000
	MMU 3,1
	SAVEBIN "page1.bin",#C000,#4000
	MMU 3,3
	SAVEBIN "page3.bin",#C000,#4000
	MMU 3,4
	SAVEBIN "page4.bin",#C000,#4000
	MMU 3,6
	SAVEBIN "page6.bin",#C000,#4000
	MMU 3,7
	SAVEBIN "page7.bin",#C000,#4000
