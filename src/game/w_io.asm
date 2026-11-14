; Ввод-вывод игры: загрузка файлов диска 2, уровней, сохранение. Сам диск - в disk.asm.
; (Оригинал 1997 года, с защитой и 1К-секторами: src/original/w_io_1997.asm.)

	INCLUDE "disk.asm"


;1-5    -ландшафты
;6      -панель
;7-8    -кнопки
;9-17   -музыки
;18-49  -уровни


READ_F	PUSH	HL ;загр и декомпр
	CALL	READ
	POP	HL
; Верх области, под которую LODlev переносит упакованный уровень для распаковки "на месте" (DELPZX).
; Было #BFFE: остатки потока лежали бы до #BFFE и затирали таблицу IM2 (#BE00-#BF00), JP #BFBF, SLAVE (#BF10) и признак
; сохранения (#BFFA). #BDFF - последний байт перед таблицей. Поток (до ~8 КБ: #9E00-#BDFF) затирает хвост MAP2, DSCR, HUMAN и
; KUNGE: это допустимо, так как после LODlev (_start -> NEWALL/CLRALL) герои, MAP2 и DSCR создаются заново (так было и
; в оригинале, где поток шёл до #BFFE).
LVLTOP	EQU	IM2_TAB-1
DELPZF	LD	DE,#FFFF
;Декомпрессор
;HL - ОТКУДА И КУДА, DE - ВЕРХНЯЯ ГРАНИЦА ОБЛАСТИ
DELPZX	PUSH	HL ;dest
	PUSH	DE ;верхняя граница
	LD	C,(HL)
	INC	HL
	LD	B,(HL) ;BC = длина потока
	INC	HL ;HL = начало потока
	PUSH	BC
	PUSH	HL
	ADD	HL,BC ;HL -> хвост: последние 4 байта данных лежат сырыми за потоком (build.py: pack_tail);
	LD	DE,DPZTAIL ;поток кончается на 4 байта раньше конца данных - запас для распаковки "на месте"
	LD	BC,4
	LDIR
	POP	HL
	POP	BC
	ADD	HL,BC
	DEC	HL ;последний байт потока
	POP	DE
	LDDR
	EX	DE,HL
	INC	HL
	POP	DE
	CALL	DELPZ
	LD	HL,DPZTAIL
	LD	BC,4
	LDIR
	RET
DPZTAIL	DEFS	4

selSAV	LD	A,(SAVDSK)
	JR	selD_
selD_2	LD	A,(DISK_2)
selD_	LD	(tDRIVE),A
	RET

LOADms ;загр. офрмл. уровня; вход: CY=1 - загрузка отложенной игры, CY=0 - новый уровень
	EX	AF,AF'
	DI
	CALL	MEM0
	EX	AF,AF'
	JR	C,lad0
	CALL	SEEonn ;0 нов ур (раньше это делала PROTeC после проверки "царапины")
	CALL	setMAP ;0
lad0
;загр ландш A=1..4
	CALL	MEM1
	LD	A,(fsLAND)
	LD	HL,_sLAND
	CP	(HL)
	JR	Z,lad2 ;загружено
	LD	(HL),A
	LD	HL,LAND
	CALL	READ_F
lad2 ;--загр панели
	LD	A,6
	LD	HL,DSCR
	CALL	READ
;--загр кнопок A=0..1
	CALL	MEM7
	LD	A,(MASTER)
	LD	HL,_sBUTT
	CP	(HL)
	JR	Z,lad3 ;загружено
	LD	(HL),A
	ADD	A,7
	LD	HL,WBUTT
	PUSH	HL
	CALL	READ
	POP	HL
	LD	DE,WNAMES
	CALL	DELPZX
lad3 ;--загр муз A=0..7 (в _sMUS - номер ФАЙЛА загруженной мелодии: набор миссий входит в него)
	CALL	MEM6
	LD	A,(fsMUS)
	ADD	A,9
	LD	C,A
	LD	A,(ExtSet)
	OR	A
	LD	A,C
	JR	Z,lad31
	ADD	A,EXTMUS ;мелодии дополнительного набора (mus1..mus8)
lad31	LD	HL,_sMUS
	CP	(HL)
	JR	Z,lad1 ;загружено
	LD	(HL),A
	LD	HL,WMUSIC
	CALL	READ_F
lad1	JP	MEM0

;----------сохранение игры--
; Слот = SLOTSEC (51) секторов файла saves: #7700..#9FFF (41; не сохраняется только рабочий экран DSCR #A000-#B7FF, см. disk.asm),
; #B800..#BFFF (8) и XY (2). Записи не шифруются (в 1997 году ENCODE/DECODE + контрольная сумма): вместо суммы - признак SAVSIG
; в #BFFA (внутри сохраняемого диапазона), пустой слот (нули) загрузкой отвергается. В сохранении же - ExtSet (набор миссий).
SAVSIGA	EQU	#BFFA
SAVSIG	EQU	#A55A

SAVgam ;сохр A=0-7
	PUSH	AF
	CALL	selSAV
	CALL	MEM6
	CALL	WMUSIC
	CALL	MEM7
	DI
	LD	HL,SAVSIG
	LD	(SAVSIGA),HL
Srtry	CALL	DSKCHK ;ждать диск с файлом saves
	POP	AF
	PUSH	AF
	CALL	SLOTPOS
	PUSH	DE
	CALL	TR000
	POP	DE
	PUSH	DE
	LD	HL,G_DATA
	LD	B,SAV1SEC
	CALL	D_WRITE
	LD	HL,HUMAN
	LD	B,SAV2SEC
	CALL	D_WRITE
	LD	HL,XY
	LD	B,2
	CALL	D_WRITE
;----пров  перв сект (читается в DSCR как в буфер: он не сохраняется)
	POP	DE
	LD	HL,DSCR
	PUSH	HL
	LD	B,1
	CALL	D_READ
	POP	HL
	JR	C,Srtry1
	LD	DE,G_DATA
	LD	B,255
svvCP0	LD	A,(DE)
	CP	(HL)
	JR	NZ,Srtry1 ;--err
	INC	HL
	INC	DE
	DJNZ	svvCP0
	POP	AF
	RET
Srtry1	JR	Srtry


LODlev ;загр нов уровня
	CALL	selD_2
	LD	A,(MASTER)
	OR	A
	LD	C,18 ;1й ур л
	JR	Z,LLV0
	LD	C,36 ;1й ур к
LLV0	LD	A,(ExtSet)
	OR	A
	LD	A,(LEVEL)
	JR	Z,LLV1 ;обычный набор
	CP	16
	JR	NC,LLV1 ;17-й уровень дополнительного набора - обычная концовка (lev117end / lev217end)
	LD	B,A
	LD	A,C
	ADD	A,EXTLEV ;файлы дополнительных уровней (disk_layout.inc)
	LD	C,A
	LD	A,B
LLV1	ADD	A,C ;# file
	LD	HL,LEVDAT
	PUSH	HL
	CALL	READ
	POP	HL
	LD	DE,LVLTOP
	CALL	DELPZX
	CALL	MEM0
	CALL	isRUNL ;для заключ уровней - набор данных
	CALL	OFFS
	LD	HL,datSCR
	LD	DE,SCR
	LD	BC,6912
	LDIR
	XOR	A
	OUT	(254),A
	RET

;----диск 2

TXds21	DEFB	14,65,66,48,50,74,66,53,10,52,56,65,58,10,02,127 ;insert d2
TXds22	DEFB	50,10,52,56,65,58,62,50,62,52,10,44,43,127 ;в д-д Х:
TXdsEn	DEFB	56,10,61,48,54,60,56,66,53,10,17,81,30,17,82,127 ;& Enter

CHNGd2
	IFDEF	ONE_DISK
	RET	;один диск (образ 1 МБ): диск менять не нужно
	ENDIF
	CALL	MEM7
	LD	DE,#403 ;смени диск2
	LD	BC,#1307
	CALL	MU_BOX
	ATR_ #403,#0713,#69
	LD	DE,#605
	LD	HL,TXds21
	CALL	PRINTS
	LD	DE,#706
	LD	HL,TXds22
	CALL	PRINTS
	DEC	DE
	DEC	DE
	LD	A,(DISK_2)
	ADD	A,12
	CALL	PRINT
	LD	DE,#805
	LD	HL,TXdsEn
	CALL	PRINTS
isENTR	LD	BC,#BFFE
	IN	A,(C)
	RRA
	RET	NC
	JR	C,isENTR

