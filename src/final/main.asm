; FINAL = концовка (код на #8000, файл 15 диска 1; запускается F_CUT загрузчика).
	DEVICE ZXSPECTRUM128
	INCLUDE "w_final.asm"
	SAVEBIN "final.bin",#8000,FINALEND-#8000
