; START1 = загрузчик диска 1: файл br1 (#6000..), интро + инструкция + их данные (B01 с #6400), страницы B02..B04.
; Сборка - build.py (нужны build/disk1_layout.inc и build/data/*.zx0).
	DEVICE ZXSPECTRUM128
	INCLUDE "w_start1.asm"
	MMU 3,0
	SAVEBIN "loader.bin",LOADER,LDREND-LOADER
	SAVEBIN "b01.bin",#6400,B01END-#6400
	MMU 3,3
	SAVEBIN "b02.bin",#C000,B02END-#C000
	MMU 3,4
	SAVEBIN "b03.bin",#C000,B03END-#C000
	MMU 3,7
	SAVEBIN "b04.bin",#DB00,B04END-#DB00
