
LEVDAT	EQU	#79C0 ;адр. нач данных уровня
	ORG	LEVDAT

DSCR	EQU	#4000

; *D-
;********* Победа людей ****************

isRUNC ; кодовый блок
	LD	A,1 ;кунги
	JP	F_CUTh

Sc1
	INCBIN "barkov/w_end_k.scr"
Sc2
	INCBIN "barkov/w_end2.scr"

F_CUTh	DI
	LD	B,A ;B = кто победил (0/1) - до того, как A понадобится
	LD	A,(DISK_2) ;дисковод игры: читать надо ДО OFFD (он заливает #4000-#57FF, в т.ч. #4003)
	LD	(tDRIVE),A
	IM	1
	LD	A,#3F ;I - как в ПЗУ (игра ставила I=#BE для IM2)
	LD	I,A
	LD	SP,LEVDAT-2
	PUSH	BC
	CALL	OFFD
	CALL	_128
	LD	HL,Sc1
	CALL	COPYAT
;пробел?
lggP	LD	BC,#7FFE
	IN	A,(C)
	AND	%1
	JR	NZ,lggP
	CALL	OFFD
	IFNDEF	ONE_DISK
	LD	HL,Sc2 ;картинка "вставьте диск 1"
	CALL	COPYAT
	CALL	A_or_B ;диск 1 вставляют в указанный дисковод
	LD	(tDRIVE),A
	ENDIF ;(один диск: он же и диск 1, tDRIVE уже задан в начале)
	CALL	OFFD
;загрузка загрузчика с диска 1 (раньше: чтение дорожки 0, сектора 9 в #5D25), раскладка - build/loader_layout.inc
	INCLUDE	"loader_layout.inc" ; LDR_ADR, LDR_TRK, LDR_SEC, LDR_CNT, LDR_FCUT
L1st	CALL	TR000
	LD	D,LDR_TRK
	LD	E,LDR_SEC
	LD	B,LDR_CNT
	LD	HL,LDR_ADR
	PUSH	HL
	CALL	D_READ
	POP	HL
	JR	C,L1st
;проверка метки диска 1 (#D1,#BB в начале загрузчика)
	LD	DE,6
	ADD	HL,DE
	LD	A,(HL)
	CP	#D1
	JR	NZ,L1st
	INC	HL
	LD	A,(HL)
	CP	#BB
	JR	NZ,L1st
	POP	BC
	LD	A,(tDRIVE)
	JP	LDR_FCUT

DISK_2	EQU	#4003 ;переменная игры: дисковод диска 2 (в игре в этом месте память не меняется)

;------------------- вспом п/п

A_or_B ;возвр: 0/1 - A/B
	NOP
	LD	BC,#7FFE
	IN	A,(C)
	AND	%10000
	LD	A,1
	RET	Z
	LD	B,#FD
	IN	A,(C)
	AND	%1
	RET	Z
	JR	NZ,A_or_B



_128	LD	A,%10000
	LD	BC,#7FFD
	OUT	(C),A
	RET

OFFD	LD	DE,DSCR+#1AFE
	PUSH	DE
	POP	HL
	INC	HL
	LD	BC,768
	LD	(HL),0
	LDDR
	LD	BC,6143
	LD	(HL),255
	LDDR
	RET

COPYAT ;из HL
	LD	BC,6912
	LD	DE,DSCR
	LDIR
	RET

	INCLUDE "disk_end.inc"
