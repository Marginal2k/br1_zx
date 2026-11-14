; Чтение сектора(ов) TR-DOS для кодового блока уровня (концовка): загрузить загрузчик с диска 1.
; Те же куски ПЗУ TR-DOS 5.03, что и в src/game/disk.asm (там - подробные комментарии).
; D_READ: D = логическая дорожка (цилиндр*2+сторона, 0..255), E = сектор 1..16, B = число секторов, HL = адрес; CY=1 - ошибка
RG_DOS	LD	IX,#2A53 ;вывод в регистр контроллера (out (C),A:ret)
	JR	DOS

COM_EX	LD	IX,#3EF5
DOS	PUSH	IX
	JP	#3D2F

POS ;позиционировать дорожку D
	LD	A,(tDRIVE)
	AND	3
	OR	#3C
	BIT	0,D
	JR	Z,DW_SID
	RES	4,A
DW_SID	LD	C,#FF
	CALL	RG_DOS
	LD	A,D
	SRL	A
	LD	C,#7F
	CALL	RG_DOS
	LD	A,#18
	LD	C,#1F
	CALL	RG_DOS
	CALL	COM_EX
	DI
	RET

RD_SCT	LD	BC,RD_SCT
	PUSH	BC
	LD	BC,#17F
	LD	IX,#2090 ;чтение сектора (портит #5CD6)
	JR	DOS

TR000	CALL	TR00 ;иниц дисковода + задержка
	CALL	TR00
TR00	DI
	LD	IX,#2F5F
	CALL	DOS
	LD	IX,#2F65
	JP	DOS

NXTSEC	INC	E
	LD	A,E
	CP	17
	RET	C
	LD	E,1
	INC	D
	JP	POS

tDRIVE	DEFB	0

D_READ	DI
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
	DI
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

ERR_RW	SCF
	RET
