; Чёрный Ворон: дисковый слой игры. Заменяет дисковую часть W_IO.A80 (1997), см. src/original/w_io_1997.asm.
;
; Всё, что игра делает с диском, проходит через этот файл:
;   D_READ   D = логическая дорожка (цилиндр*2+сторона), E = сектор 1..16, B = число секторов, HL = адрес;
;            читает B секторов по 256 байт подряд (переходя на следующие дорожки); CY=1 - ошибка (3 попытки на сектор)
;   D_WRITE  то же, пишет
;   TR000    перекалибровка дисковода (перед повтором)
;   READ     A = номер файла ресурса диска 2 (1..94, таблица RESTAB), HL = адрес: загрузить файл целиком (с повтором)
;   SLOTPOS  A = слот сохранения 0..NSLOTS-1 -> D, E = дорожка, сектор первого сектора слота (SLOTSEC=51 сектор)
;   DSKCHK   подождать, пока в дисководе tDRIVE не окажется диск 2 (сверка названия диска в системном секторе)
;   tDRIVE   (переменная в wmain.asm) номер дисковода 0/1 (A/B) для всех операций
;
; Диск - обычный TR-DOS: секторы по 256 байт 1..16, логическая дорожка = цилиндр*2 + сторона. Где лежит каждый
; файл, записано в build/disk_layout.inc (его делает build.py); в каталоге TR-DOS файлы видны, но игра читает их
; по положению.
;
; Игра держит код в области #4000.. (экран и системные переменные TR-DOS), поэтому вход #3D13 использовать
; нельзя. Как и в 1997 году, секторы читаются кусками ПЗУ TR-DOS 5.03 через #3D2F: #2A53 (OUT (C),A), #3EF5
; (ждать контроллер), #2090 (чтение сектора), #2FC3/#3FCA (запись), #2F5F/#2F65 (на нулевую дорожку).
; ПЗУ хранит код ошибки в #5CD6 - это байт кода игры, он сохраняется и возвращается здесь.
; Чтобы перенести игру на другую дисковую систему, нужно переписать только этот файл.

	INCLUDE "disk_layout.inc"	; RESTAB, SAVELIN, NSLOTS, EXTLEV, EXTMUS (генерируется build.py)

; Слот сохранения: #7700..#9FFF (G_DATA..MAP2) + #B800..#BFFF (HUMAN, KUNGE, таблица IM2, SLAVE, SAVSIG) + XY.
; Рабочий экран DSCR (#A000..#B7FF) не сохраняется: после чтения LODgam кладёт на него временный код (LDItmp), CONTgm
; грузит панель (LOADms) и ENTRY рисует экран заново (putBAR, FRAME, OUMAIN).
SAV1SEC	EQU	(DSCR-G_DATA)/256	; 41
SAV2SEC	EQU	(#C000-HUMAN)/256	; 8
SLOTSEC	EQU	SAV1SEC+SAV2SEC+2	; секторов в слоте: 41 + 8 + XY (2) = 51

; позиционирование: D = логическая дорожка
POS	LD	A,(tDRIVE)
	AND	3
	OR	#3C		; сторона 0, MFM, без сброса
	BIT	0,D
	JR	Z,DW_SID
	RES	4,A		; сторона 1
DW_SID	LD	C,#FF
	CALL	RG_DOS
	LD	A,D
	SRL	A
	LD	C,#7F
	CALL	RG_DOS
	LD	A,#18		; seek
	LD	C,#1F
	CALL	RG_DOS
	CALL	COM_EX
	DI
	RET

RD_SCT	LD	BC,RD_SCT
	PUSH	BC
	LD	BC,#17F
	LD	IX,#2090	; чтение сектора (портит #5CD6)
	JR	DOS

RG_DOS	LD	IX,#2A53	; вывод в регистр контроллера (out (C),A: ret)
	JR	DOS

COM_EX	LD	IX,#3EF5	; ждать выполнения команды
DOS	PUSH	IX
	JP	#3D2F

ERR_RW	SCF
	RET

TR000	CALL	TR0
TR0	CALL	TR00
TR00	DI
	LD	IX,#2F5F
	CALL	DOS
	LD	IX,#2F65
	JP	DOS

; следующий сектор: E = 1..16, потом следующая логическая дорожка
NXTSEC	INC	E
	LD	A,E
	CP	17
	RET	C
	LD	E,1
	INC	D
	JP	POS

D_READ	DI ;E-сектор,D-дорожка,B-число секторов,HL-адрес
	CALL	POS
	LD	A,(#5CD6)
	EX	AF,AF'
NXT_S	LD	IXL,3 ;число попыток
NXT_SC	PUSH	HL
	PUSH	BC
	PUSH	IX
	LD	C,#5F
	LD	A,E
	CALL	RG_DOS
	CALL	RD_SCT
	DI ;обязательно
	LD	HL,#5CD6
	EX	AF,AF'
	CP	(HL)
	POP	IX
	JR	Z,GOOD
	LD	(HL),A
	DEC	IXL
	POP	BC
	POP	HL
	JP	Z,ERR_RW
	EX	AF,AF'
	JR	NXT_SC
GOOD	POP	BC
	POP	HL
	EX	AF,AF'
	CALL	NXTSEC
	INC	H
	DJNZ	NXT_S
	XOR	A
	RET

D_WRITE	DI ;запись секторов по 256 байт
	CALL	POS
LOPWR1	PUSH	HL
	PUSH	BC
	LD	C,#5F
	LD	A,E
	CALL	RG_DOS
	CALL	WR_SC
	DI
	POP	BC
	POP	HL
	CALL	NXTSEC
	INC	H
	DJNZ	LOPWR1
	RET

WR_SC	LD	A,#A0
	LD	IX,#2FC3
	CALL	DOS
	LD	IX,#3FCA	; IN A,(#FF): AND #C0: JR Z: RET M: OUTI: JR
	LD	C,#7F
	JP	DOS

; READ: A = номер файла (1..52), HL = адрес
READ	PUSH	HL
	LD	L,A
	LD	H,0
	LD	D,H
	LD	E,L
	ADD	HL,HL
	ADD	HL,DE
	LD	DE,RESTAB-3
	ADD	HL,DE
	LD	D,(HL)		; дорожка
	INC	HL
	LD	E,(HL)		; сектор
	INC	HL
	LD	B,(HL)		; число секторов
	POP	HL
READ1	PUSH	HL
	PUSH	DE
	PUSH	BC
	CALL	D_READ
	POP	BC
	POP	DE
	POP	HL
	RET	NC
	CALL	TR000
	JR	READ1

; SLOTPOS: A = слот 0..7 -> D = дорожка, E = сектор (1..16) первого сектора слота; слот = SLOTSEC (51) секторов подряд; слотов NSLOTS (8, на образе 1 МБ - 6: disk_layout.inc)
SLOTPOS	LD	HL,SAVELIN
	INC	A
SLP0	DEC	A
	JR	Z,SLP1
	LD	BC,SLOTSEC
	ADD	HL,BC
	JR	SLP0
SLP1	LD	A,L
	AND	15
	INC	A
	LD	E,A		; сектор 1..16
	LD	B,4
SLP2	SRL	H
	RR	L
	DJNZ	SLP2
	LD	D,L		; дорожка (0..255: на диске 1 МБ - до 255)
	RET

; DSKCHK: ждать диск 2 в дисководе tDRIVE: системный сектор (дорожка 0, сектор 9), название диска (8 байт, #F5)
DSKCHK	CALL	TR000
	LD	DE,#0009
	LD	B,1
	LD	HL,BF_256
	PUSH	HL
	CALL	D_READ
	POP	HL
	JR	C,DSKCHK
	LD	DE,#F5
	ADD	HL,DE
	LD	DE,DSKNAME	; (в disk_layout.inc: название диска, 8 байт)
	LD	B,8
DSKC1	LD	A,(DE)
	CP	(HL)
	JR	NZ,DSKCHK
	INC	DE
	INC	HL
	DJNZ	DSKC1
	RET

